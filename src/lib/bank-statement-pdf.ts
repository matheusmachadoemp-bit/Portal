import { ensureFakeWorkerGlobal, standardFontDataUrl } from "@/lib/ponto-pdf-import";

/**
 * Leitura de extrato bancário em PDF (com texto selecionável — não vale PDF escaneado/foto).
 *
 * Um PDF de extrato é uma TABELA desenhada: cada trecho de texto tem uma posição (x/y) na página.
 * Em vez de depender da ordem em que o PDF concatena o texto, reconstrói linhas e colunas pela
 * posição:
 *  - acha o cabeçalho da tabela em cada página (pode ter dois níveis, como "Movimentos (R$)" em
 *    cima de "Créditos | Débitos"), e como a posição das colunas muda de página pra página
 *    ("Continuação"), recalcula as colunas a cada cabeçalho;
 *  - atribui cada trecho de texto à coluna certa (data, descrição, crédito, débito, valor, saldo);
 *  - bancos escrevem a data só na primeira linha do dia e sem o ano (01/09) — completa a data das
 *    linhas seguintes e descobre o ano pelo cabeçalho do extrato ("setembro/2026");
 *  - descrições que quebram em duas linhas (nome de quem recebeu) são juntadas à linha anterior;
 *  - a tabela termina onde há um espaço vertical grande (rodapé, outra seção), então textos fora da
 *    tabela nunca viram lançamento.
 * O resultado é a mesma "tabela de linhas e células" que o CSV/Excel produz, e daí em diante segue
 * o mesmo caminho (`parseTable`, em bank-statement.ts).
 */

export type PdfToken = { str: string; x0: number; x1: number; y: number; h: number };
export type PdfPage = PdfToken[];

type Cell = string | number;
type RoleOf = (headerText: string) => string;

/** Limites contra PDF gigante/malicioso (um extrato mensal real tem dezenas de páginas). */
export const MAX_PDF_PAGES = 300;
export const MAX_PDF_TOKENS_PER_PAGE = 30000;

export class PdfTooLargeError extends Error {}

export async function readPdfPages(buffer: Buffer): Promise<PdfPage[]> {
  await ensureFakeWorkerGlobal();
  const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(buffer),
    disableFontFace: true,
    standardFontDataUrl: standardFontDataUrl(),
  });
  try {
    return await readPages(await loadingTask.promise);
  } finally {
    // Libera a memória do documento (sem isto, cada leitura deixava ~250 KB retidos).
    await loadingTask.destroy().catch(() => {});
  }
}

async function readPages(doc: { numPages: number; getPage: (n: number) => Promise<{ getTextContent: () => Promise<{ items: unknown[] }> }> }): Promise<PdfPage[]> {
  if (doc.numPages > MAX_PDF_PAGES) throw new PdfTooLargeError(`PDF com páginas demais (${doc.numPages}).`);
  const pages: PdfPage[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    if (content.items.length > MAX_PDF_TOKENS_PER_PAGE) throw new PdfTooLargeError(`Página ${p} com texto demais.`);
    const tokens: PdfToken[] = [];
    for (const raw of content.items) {
      const it = raw as { str?: string; transform?: number[]; width?: number; height?: number };
      if (typeof it.str !== "string" || !it.transform) continue;
      if (it.str.trim() === "") continue;
      const x0 = it.transform[4];
      tokens.push({
        str: it.str,
        x0,
        x1: x0 + (it.width ?? 0),
        y: it.transform[5],
        h: Math.abs(it.transform[3]) || it.height || 10,
      });
    }
    pages.push(tokens);
  }
  return pages;
}

type Cellspan = { text: string; x0: number; x1: number };
type Line = { y: number; cells: Cellspan[] };

/** Agrupa trechos de texto em linhas (mesmo y) e funde trechos vizinhos (palavras de uma mesma célula). */
function buildLines(tokens: PdfToken[]): Line[] {
  const sorted = [...tokens].sort((a, b) => b.y - a.y || a.x0 - b.x0);
  const groups: { y: number; items: PdfToken[] }[] = [];
  for (const t of sorted) {
    // Ordenado por y decrescente: um trecho da mesma linha só pode cair no ÚLTIMO grupo criado.
    const g = groups[groups.length - 1];
    if (g && Math.abs(g.y - t.y) < 2.5) g.items.push(t);
    else groups.push({ y: t.y, items: [t] });
  }
  groups.sort((a, b) => b.y - a.y);

  return groups.map((g) => {
    const items = g.items.sort((a, b) => a.x0 - b.x0);
    const cells: Cellspan[] = [];
    for (const t of items) {
      const last = cells[cells.length - 1];
      const gap = last ? t.x0 - last.x1 : Infinity;
      if (last && gap <= Math.max(3, t.h * 0.7)) {
        last.text += (gap > 0.8 ? " " : "") + t.str;
        last.x1 = Math.max(last.x1, t.x1);
      } else {
        cells.push({ text: t.str, x0: t.x0, x1: t.x1 });
      }
    }
    return { y: g.y, cells: cells.map((c) => ({ ...c, text: c.text.replace(/\s+/g, " ").trim() })) };
  });
}

const MONEY_LIKE = /^[(+\-−]?\s*(?:R\$\s*)?\d[\d.,]*\s*[)\-−]?\s*(?:[DCdc]|DB|CR)?$/;

function isMoneyLike(text: string): boolean {
  // Só valores com parte decimal ou sinal: número de documento (inteiro puro) não é valor.
  return MONEY_LIKE.test(text) && (/[.,]\d{1,2}\s*[)\-−]?\s*(?:[DCdc]|DB|CR)?$/.test(text) || /^[(+\-−]/.test(text) || /[\-−]$/.test(text));
}

type HeaderCol = { role: string; label: string; x0: number; x1: number; center: number };
type Header = {
  lineIndex: number; // linha do cabeçalho (a de cima, se for de dois níveis)
  lastLineIndex: number; // última linha do cabeçalho
  date: HeaderCol;
  description: HeaderCol | null;
  descRight: number;
  amounts: HeaderCol[]; // credit / debit / value / balance
  indicator: HeaderCol | null; // coluna D/C (Débito/Crédito) com texto curto
};

const AMOUNT_ROLES = new Set(["credit", "debit", "value", "balance"]);

function detectHeader(lines: Line[], from: number, roleOf: RoleOf): Header | null {
  for (let i = from; i < lines.length; i++) {
    const first = lines[i];
    const hasDate = first.cells.some((c) => roleOf(c.text) === "date");
    if (!hasDate) continue;

    // Cabeçalho pode ocupar até 3 linhas seguidas (nível de cima + subcolunas).
    const block = lines.slice(i, i + 3).filter((l, k) => k === 0 || lines[i].y - l.y <= 40);
    const cols: HeaderCol[] = [];
    block.forEach((l) => {
      for (const c of l.cells) {
        const role = roleOf(c.text);
        cols.push({ role, label: c.text, x0: c.x0, x1: c.x1, center: (c.x0 + c.x1) / 2 });
      }
    });
    const date = cols.find((c) => c.role === "date");
    const hasMovement =
      cols.some((c) => c.role === "value") || (cols.some((c) => c.role === "credit") && cols.some((c) => c.role === "debit"));
    if (!date || !hasMovement) continue;

    const description = cols.find((c) => c.role === "description") ?? null;
    const amounts = cols.filter((c) => AMOUNT_ROLES.has(c.role));
    // A descrição termina onde começa a próxima coluna à direita (nº de documento, valores...).
    const descLeft = description ? description.x0 : date.x1;
    const rightStarts = cols.filter((c) => c.x0 > descLeft + 20 && c !== description).map((c) => c.x0);
    const descRight = rightStarts.length ? Math.min(...rightStarts) - 2 : Infinity;

    let lastLineIndex = i;
    block.forEach((l, k) => {
      if (l.cells.some((c) => roleOf(c.text) !== "ignore") || k === 0) lastLineIndex = i + k;
    });
    const indicator = cols.find((c) => c.role === "indicator") ?? null;
    return { lineIndex: i, lastLineIndex, date, description, descRight, amounts, indicator };
  }
  return null;
}

const MONTHS: Record<string, number> = {
  janeiro: 1, fevereiro: 2, marco: 3, abril: 4, maio: 5, junho: 6, julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12,
};

/** Descobre mês/ano do extrato ("setembro/2026", "09/2026" ou datas completas dd/mm/aaaa no texto). */
export function inferPeriod(pages: PdfPage[]): { month: number | null; year: number } | null {
  const text = pages
    .flat()
    .map((t) => t.str)
    .join(" ")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
  const named = /(janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\s*\/\s*(\d{4})/.exec(text);
  if (named) return { month: MONTHS[named[1]], year: Number(named[2]) };
  const numeric = /\b(0?[1-9]|1[0-2])\s*\/\s*(20\d{2})\b/.exec(text);
  if (numeric) return { month: Number(numeric[1]), year: Number(numeric[2]) };
  const years = new Map<number, number>();
  for (const m of text.matchAll(/\b\d{1,2}\/\d{1,2}\/(20\d{2})\b/g)) years.set(Number(m[1]), (years.get(Number(m[1])) ?? 0) + 1);
  if (years.size) {
    const [year] = [...years.entries()].sort((a, b) => b[1] - a[1])[0];
    return { month: null, year };
  }
  return null;
}

function withYear(dateText: string, period: { month: number | null; year: number } | null): string {
  const m = /^(\d{1,2})[/.-](\d{1,2})$/.exec(dateText.trim());
  if (!m) return dateText;
  const month = Number(m[2]);
  let year = period?.year ?? new Date().getFullYear();
  if (period?.month) {
    if (month > period.month + 6) year -= 1; // ex.: dezembro num extrato de janeiro
    else if (month < period.month - 6) year += 1;
  }
  return `${m[1].padStart(2, "0")}/${String(month).padStart(2, "0")}/${year}`;
}

const DATE_ONLY = /^\d{1,2}[/.-]\d{1,2}(?:[/.-]\d{2,4})?$/;

export type PdfTable = { rows: Cell[][]; note: string };

/**
 * Converte as páginas lidas em linhas de tabela (cabeçalho + dados), no mesmo formato do CSV/Excel.
 * Devolve null se nenhuma página tem uma tabela reconhecível (data + valor, ou data + crédito/débito).
 */
export function pdfPagesToTable(pages: PdfPage[], roleOf: RoleOf): PdfTable | null {
  const period = inferPeriod(pages);
  let hasCredit = false;
  let hasDebit = false;
  let hasValue = false;
  let hasBalance = false;
  let hasIndicator = false;
  type Raw = { date: string; desc: string; credit: string; debit: string; value: string; balance: string; indicator: string };
  const out: Raw[] = [];
  let currentDate = "";
  let last: Raw | null = null;
  let tablesFound = 0;

  for (const page of pages) {
    const lines = buildLines(page);
    let cursor = 0;
    while (cursor < lines.length) {
      const header = detectHeader(lines, cursor, roleOf);
      if (!header) break;
      tablesFound++;
      hasCredit ||= header.amounts.some((c) => c.role === "credit");
      hasDebit ||= header.amounts.some((c) => c.role === "debit");
      hasValue ||= header.amounts.some((c) => c.role === "value");
      hasBalance ||= header.amounts.some((c) => c.role === "balance");
      hasIndicator ||= header.indicator !== null;

      const body = lines.slice(header.lastLineIndex + 1);
      // Fim da tabela: espaço vertical muito maior que o espaçamento normal entre linhas.
      const steps = body.slice(0, 40).map((l, k, arr) => (k === 0 ? 0 : arr[k - 1].y - l.y)).filter((d) => d > 0);
      const sortedSteps = [...steps].sort((a, b) => a - b);
      const median = sortedSteps.length ? sortedSteps[Math.floor(sortedSteps.length / 2)] : 12;
      const maxGap = Math.max(median * 2.2, 18);

      let prevY = lines[header.lastLineIndex].y;
      let consumed = 0;
      for (const line of body) {
        if (prevY - line.y > maxGap && consumed > 0) break;
        // Outro cabeçalho repetido no meio da página: deixa o laço externo reconhecê-lo.
        if (line.cells.some((c) => roleOf(c.text) === "date") && line.cells.length >= 3) break;
        // Texto à esquerda da coluna de data é margem/rodapé da página, nunca linha da tabela.
        if (line.cells.some((c) => c.x0 < header.date.x0 - 3)) break;
        prevY = line.y;
        consumed++;

        const raw: Raw = { date: "", desc: "", credit: "", debit: "", value: "", balance: "", indicator: "" };
        const descParts: string[] = [];
        for (const c of line.cells) {
          const descRight = header.descRight;
          const descLeft = header.description ? header.description.x0 : header.date.x1;
          if (c.x0 < descLeft - 3 && DATE_ONLY.test(c.text)) {
            raw.date = c.text;
          } else if (c.x1 <= descRight + 6 && c.x0 >= header.date.x0 - 3) {
            descParts.push(c.text);
          } else if (isMoneyLike(c.text) && header.amounts.length) {
            const center = (c.x0 + c.x1) / 2;
            const nearest = header.amounts.reduce((a, b) => (Math.abs(b.center - center) < Math.abs(a.center - center) ? b : a));
            if (Math.abs(nearest.center - center) > 70) continue;
            if (nearest.role === "credit") raw.credit = c.text;
            else if (nearest.role === "debit") raw.debit = c.text;
            else if (nearest.role === "value") raw.value = c.text;
            else raw.balance = c.text;
          } else if (header.indicator && c.text.length <= 12 && Math.abs((c.x0 + c.x1) / 2 - header.indicator.center) <= 40) {
            raw.indicator = c.text; // coluna D/C (Débito/Crédito)
          }
          // demais textos (nº de documento, "-") são ignorados
        }
        raw.desc = descParts.join(" ").trim();

        if (raw.date) currentDate = withYear(raw.date, period);
        const hasMovement = !!(raw.credit || raw.debit || raw.value);
        if (hasMovement) {
          raw.date = currentDate;
          out.push(raw);
          last = raw;
        } else if (raw.desc && /^\s*(s\s*a\s*l\s*d\s*o|saldo)\b/i.test(raw.desc)) {
          // linha de saldo ("SALDO EM 31/08"): entra na tabela (o leitor de tabela a usa na conferência de saldo e a ignora como lançamento)
          raw.date = "";
          out.push(raw);
          last = null;
        } else if (raw.desc && last && !raw.date) {
          last.desc = `${last.desc} ${raw.desc}`.trim(); // continuação da descrição (2ª linha)
        } else if (raw.date && raw.desc) {
          raw.date = currentDate;
          out.push(raw);
          last = raw;
        }
      }
      cursor = header.lastLineIndex + 1 + consumed;
    }
  }

  if (tablesFound === 0 || out.length === 0) return null;

  const headerRow: Cell[] = ["Data", "Descrição"];
  if (hasCredit || hasDebit) headerRow.push("Crédito", "Débito");
  if (hasValue) headerRow.push("Valor");
  if (hasIndicator) headerRow.push("D/C");
  if (hasBalance) headerRow.push("Saldo");
  const rows: Cell[][] = [headerRow];
  for (const r of out) {
    const row: Cell[] = [r.date, r.desc];
    if (hasCredit || hasDebit) row.push(r.credit, r.debit);
    if (hasValue) row.push(r.value);
    if (hasIndicator) row.push(r.indicator);
    if (hasBalance) row.push(r.balance);
    rows.push(row);
  }

  const parts = [`${tablesFound} tabela(s) de movimentação encontrada(s)`];
  if (period) parts.push(`período ${period.month ? String(period.month).padStart(2, "0") + "/" : ""}${period.year}`);
  else parts.push("ano não encontrado no PDF: usado o ano atual");
  return { rows, note: parts.join(" · ") };
}
