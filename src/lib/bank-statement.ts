import { Extractor, Reader, type NormalizedTransaction } from "ofx-data-extractor";
import { parseExcelDateCode, readWorkbookRows } from "@/lib/xlsx-import";
import { spStartOfDay } from "@/lib/timezone";
import { PdfTooLargeError, pdfPagesToTable, readPdfPages } from "@/lib/bank-statement-pdf";

/**
 * Leitura de extrato bancário para a Conciliação Bancária (Financeiro).
 *
 * Em vez de depender da extensão do arquivo e de um único layout de colunas, o sistema descobre
 * sozinho o que recebeu:
 *  1. Formato pelo CONTEÚDO do arquivo (assinatura dos primeiros bytes): OFX, PDF (com texto),
 *     planilha Excel (.xlsx), texto delimitado (CSV/TSV/TXT) — e reconhece, para explicar com
 *     clareza, os que não lê: Excel antigo (.xls), CNAB, PDF escaneado e imagens.
 *  2. Em texto: codificação (UTF-8, UTF-16 ou Windows-1252, comum em banco brasileiro), separador
 *     (; , tab |), a LINHA do cabeçalho (muitos bancos colocam dados da conta antes) e o papel de
 *     cada coluna (data, descrição, valor, crédito/débito, indicador D/C, saldo) — pelo nome da
 *     coluna e, sem cabeçalho, pelo conteúdo.
 *  3. Em cada célula: datas (dd/mm/aaaa, aaaa-mm-dd, mês por extenso, número de série do Excel...) e
 *     valores (1.234,56 / 1,234.56 / R$ -10,00 / (10,00) / 10,00- / 10,00 D), inclusive qual
 *     convenção o arquivo usa para decimal e para dia/mês.
 *  4. Linhas de saldo/total/rodapé são ignoradas (e contadas), nunca viram lançamento.
 *
 * O resultado inclui `detected`, um texto em português com o que foi reconhecido, mostrado ao
 * usuário na tela de importação para ele conferir.
 */

export type StatementTransaction = {
  date: Date;
  descricao: string;
  direction: "ENTRADA" | "SAIDA";
  valor: number;
};

export type StatementFormat = "OFX" | "XLSX" | "CSV" | "PDF";

export type ParsedStatement = {
  format: StatementFormat;
  transactions: StatementTransaction[];
  /** Linhas que parecem lançamentos mas não foi possível ler (data/valor inválidos). */
  errors: string[];
  /** Linhas de saldo, total, rodapé ou valor zero, deliberadamente não importadas. */
  ignored: number;
  /** Amostra (até 5) das descrições ignoradas, pra o usuário conferir o que ficou de fora. */
  ignoredSamples: string[];
  /** Descrição legível do que foi reconhecido (formato, separador, colunas...). */
  detected: string;
  /** Conferência dos saldos que o próprio extrato imprime contra a soma dos lançamentos lidos (null = extrato sem coluna de saldo). */
  balanceCheck: { checked: number; matched: number } | null;
  /** Conferência dos totais lidos contra a linha "TOTAL" que o próprio arquivo traz (null = arquivo sem linha de total). */
  totalsCheck: { matched: boolean; credit: number; debit: number; reportedCredit: number; reportedDebit: number } | null;
};

/** Erro com mensagem pronta para mostrar ao usuário (formato não suportado / não entendido). */
export class StatementFormatError extends Error {}

// ---------------------------------------------------------------------------
// Detecção de formato
// ---------------------------------------------------------------------------

export type DetectedKind = "OFX" | "XLSX" | "XLS" | "PDF" | "IMAGE" | "CNAB" | "ZIP" | "TEXT";

export function detectKind(buffer: Buffer): DetectedKind {
  if (buffer.length >= 4 && buffer.subarray(0, 4).toString("latin1") === "%PDF") return "PDF";
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]))) return "XLS";
  if (buffer.length >= 4 && buffer[0] === 0x50 && buffer[1] === 0x4b && buffer[2] === 0x03 && buffer[3] === 0x04) {
    // .xlsx é um ZIP; outros ZIPs (docx, pptx, zip comum) não servem.
    return buffer.includes(Buffer.from("xl/")) ? "XLSX" : "ZIP";
  }
  if (buffer.length >= 4) {
    const b0 = buffer[0];
    const b1 = buffer[1];
    if ((b0 === 0x89 && b1 === 0x50) || (b0 === 0xff && b1 === 0xd8) || (b0 === 0x47 && b1 === 0x49)) return "IMAGE";
  }

  const head = buffer.subarray(0, 3000).toString("latin1").toUpperCase();
  if (head.includes("OFXHEADER") || head.includes("<OFX>") || head.includes("<?OFX")) return "OFX";

  // CNAB: linhas de largura fixa (240 ou 400 caracteres), só números e maiúsculas.
  const lines = buffer
    .subarray(0, 5000)
    .toString("latin1")
    .split(/\r?\n/)
    .filter((l) => l.length > 0)
    .slice(0, 3);
  if (lines.length >= 2 && lines.every((l) => (l.length === 240 || l.length === 400) && /^\d{3}/.test(l))) return "CNAB";

  return "TEXT";
}

/** Decodifica texto: UTF-16 (com BOM), UTF-8 (rígido) ou, se não for UTF-8 válido, Windows-1252. */
export function decodeText(buffer: Buffer): { text: string; encoding: string } {
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
    return { text: buffer.subarray(2).toString("utf16le"), encoding: "UTF-16" };
  }
  if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) {
    const body = buffer.subarray(2);
    const swapped = Buffer.from(body.subarray(0, body.length - (body.length % 2)));
    swapped.swap16();
    return { text: swapped.toString("utf16le"), encoding: "UTF-16" };
  }
  const start = buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf ? 3 : 0;
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(buffer.subarray(start));
    return { text, encoding: "UTF-8" };
  } catch {
    try {
      return { text: new TextDecoder("windows-1252").decode(buffer.subarray(start)), encoding: "Windows-1252" };
    } catch {
      return { text: buffer.subarray(start).toString("latin1"), encoding: "Windows-1252" };
    }
  }
}

// ---------------------------------------------------------------------------
// CSV / texto delimitado
// ---------------------------------------------------------------------------

/** Parser de texto delimitado com suporte a aspas ("a;b" e "" escapado) e quebras de linha dentro de aspas. */
export function parseDelimited(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let fieldBlank = true; // campo só com espaços até agora (evita field.trim() a cada caractere)
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"' && fieldBlank) {
      inQuotes = true;
      field = "";
      fieldBlank = false;
    } else if (ch === delimiter) {
      row.push(field.trim());
      field = "";
      fieldBlank = true;
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field.trim());
      field = "";
      fieldBlank = true;
      rows.push(row);
      row = [];
    } else {
      field += ch;
      if (fieldBlank && ch.trim() !== "") fieldBlank = false;
    }
  }
  row.push(field.trim());
  if (row.some((c) => c !== "")) rows.push(row);
  return rows;
}

const DELIMITERS = [";", "\t", ",", "|"];

/** Escolhe o separador que dá um número de colunas consistente na maioria das linhas. */
export function detectDelimiter(text: string): string {
  const sample = text.slice(0, 30000);
  let best = ";";
  let bestScore = -1;
  for (const delimiter of DELIMITERS) {
    const rows = parseDelimited(sample, delimiter).slice(0, 80);
    const counts = new Map<number, number>();
    for (const r of rows) counts.set(r.length, (counts.get(r.length) ?? 0) + 1);
    let modeSize = 0;
    let modeCount = 0;
    for (const [size, count] of counts) {
      if (size >= 2 && (count > modeCount || (count === modeCount && size > modeSize))) {
        modeSize = size;
        modeCount = count;
      }
    }
    // Mais linhas consistentes e mais colunas = melhor (peso maior em consistência).
    const score = modeCount * 10 + Math.min(modeSize, 12);
    if (score > bestScore) {
      bestScore = score;
      best = delimiter;
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Cabeçalhos / papéis das colunas
// ---------------------------------------------------------------------------

type ColumnRole = "date" | "description" | "value" | "credit" | "debit" | "indicator" | "balance" | "ignore";

export function normalizeHeader(h: string): string {
  return h
    .slice(0, 100) // cabeçalho real é curto; evita trabalho quadrático em célula gigante
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\(.*?\)/g, "")
    .replace(/r\$/g, "")
    .replace(/[^a-z0-9]/g, "");
}

const ROLE_ALIASES: Record<string, ColumnRole> = {
  // data
  data: "date",
  dia: "date",
  date: "date",
  dt: "date",
  datalancamento: "date",
  datamovimento: "date",
  datamovimentacao: "date",
  datamov: "date",
  datalanc: "date",
  datatransacao: "date",
  dtlancamento: "date",
  dtmovimento: "date",
  datadalancamento: "date",
  datadamovimentacao: "date",
  datadatransacao: "date",
  datacontabil: "date",
  // descrição
  descricao: "description",
  historico: "description",
  lancamento: "description",
  descricaodolancamento: "description",
  historicodolancamento: "description",
  descricaodatransacao: "description",
  detalhes: "description",
  detalhe: "description",
  memo: "description",
  name: "description",
  nome: "description",
  favorecido: "description",
  beneficiario: "description",
  estabelecimento: "description",
  titulo: "description",
  complemento: "description",
  descricaodamovimentacao: "description",
  transacao: "description",
  // valor único
  valor: "value",
  valordalancamento: "value",
  valordatransacao: "value",
  quantia: "value",
  amount: "value",
  montante: "value",
  vlr: "value",
  // crédito / débito em colunas separadas
  credito: "credit",
  creditos: "credit",
  entrada: "credit",
  entradas: "credit",
  recebimento: "credit",
  recebimentos: "credit",
  receita: "credit",
  credit: "credit",
  debito: "debit",
  debitos: "debit",
  saida: "debit",
  saidas: "debit",
  pagamento: "debit",
  pagamentos: "debit",
  despesa: "debit",
  debit: "debit",
  // indicador débito/crédito
  natureza: "indicator",
  dc: "indicator",
  cd: "indicator",
  debcred: "indicator",
  credeb: "indicator",
  debitocredito: "indicator",
  creditodebito: "indicator",
  indicador: "indicator",
  sinal: "indicator",
  tipo: "indicator",
  tipolancamento: "indicator",
  tipotransacao: "indicator",
  tipodelancamento: "indicator",
  // saldo (não é movimento)
  saldo: "balance",
  saldodia: "balance",
  saldoparcial: "balance",
  saldoapos: "balance",
  balance: "balance",
};

function roleOfHeader(cell: string): ColumnRole {
  return ROLE_ALIASES[normalizeHeader(cell)] ?? "ignore";
}

export function indicatorDirection(raw: string): "ENTRADA" | "SAIDA" | null {
  const w = raw
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\.$/, "");
  if (["d", "db", "deb", "debito", "saida", "s", "-"].includes(w)) return "SAIDA";
  if (["c", "cr", "cred", "credito", "entrada", "e", "+"].includes(w)) return "ENTRADA";
  return null;
}

type Layout = {
  headerRow: number | null; // índice 0-based; null = sem cabeçalho (colunas inferidas pelo conteúdo)
  date: number;
  descriptions: number[];
  value: number | null;
  credit: number | null;
  debit: number | null;
  indicator: number | null;
  balance: number | null;
  labels: Record<string, string>;
};

type Cell = string | number;

function cellText(c: Cell | undefined): string {
  return c === undefined || c === null ? "" : String(c).trim();
}

function findHeaderLayout(rows: Cell[][]): Layout | null {
  let best: { index: number; score: number; layout: Layout } | null = null;
  const limit = Math.min(rows.length, 80);
  for (let i = 0; i < limit; i++) {
    const row = rows[i];
    const roles = row.map((c) => roleOfHeader(cellText(c)));
    const pick = (role: ColumnRole) => roles.findIndex((r) => r === role);
    const date = pick("date");
    const value = pick("value");
    const credit = pick("credit");
    const debit = pick("debit");
    if (date < 0 || (value < 0 && credit < 0 && debit < 0)) continue;

    const descriptions = roles.map((r, idx) => (r === "description" ? idx : -1)).filter((idx) => idx >= 0);
    const indicator = pick("indicator");
    const balance = pick("balance");
    const score =
      2 + // data + algum valor
      (descriptions.length > 0 ? 1 : 0) +
      (value >= 0 ? 1 : 0) +
      (credit >= 0 && debit >= 0 ? 1 : 0);
    const labels: Record<string, string> = { data: cellText(row[date]) };
    if (descriptions.length) labels["descrição"] = descriptions.map((d) => cellText(row[d])).join(" + ");
    if (value >= 0) labels.valor = cellText(row[value]);
    if (credit >= 0) labels["crédito"] = cellText(row[credit]);
    if (debit >= 0) labels["débito"] = cellText(row[debit]);
    const layout: Layout = {
      headerRow: i,
      date,
      descriptions,
      value: value >= 0 ? value : null,
      credit: credit >= 0 ? credit : null,
      debit: debit >= 0 ? debit : null,
      indicator: indicator >= 0 ? indicator : null,
      balance: balance >= 0 ? balance : null,
      labels,
    };
    if (!best || score > best.score) best = { index: i, score, layout };
  }
  if (!best) return null;

  const layout = best.layout;
  // "Tipo"/"Natureza" só vale como indicador D/C se o CONTEÚDO da coluna for D/C/Débito/Crédito;
  // senão é só mais um texto descritivo (ex.: "Tipo: Pix enviado").
  if (layout.indicator !== null) {
    const cells = rows
      .slice(best.index + 1, best.index + 60)
      .map((r) => cellText(r[layout.indicator!]).toLowerCase())
      .filter((c) => c !== "");
    const ok = cells.length > 0 && cells.filter((c) => indicatorDirection(c) !== null).length / cells.length >= 0.8;
    if (!ok) {
      layout.descriptions.push(layout.indicator);
      layout.descriptions.sort((a, b) => a - b);
      layout.indicator = null;
    } else {
      layout.labels.indicador = cellText(rows[best.index][layout.indicator]);
    }
  }
  return layout;
}

// ---------------------------------------------------------------------------
// Datas e valores
// ---------------------------------------------------------------------------

const MONTHS_PT: Record<string, number> = {
  jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6, jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12,
};

type DateOrder = "DMY" | "MDY";

function validYmd(y: number, m: number, d: number): boolean {
  if (y < 1990 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return false;
  const check = new Date(Date.UTC(y, m - 1, d));
  return check.getUTCFullYear() === y && check.getUTCMonth() === m - 1 && check.getUTCDate() === d;
}

function ymdKey(y: number, m: number, d: number): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${y}-${pad(m)}-${pad(d)}`;
}

/** Converte uma célula de data em Date (meia-noite de São Paulo), ou null se não for uma data válida. */
export function parseDateCell(raw: Cell | undefined, order: DateOrder = "DMY"): Date | null {
  if (raw === undefined || raw === null || raw === "") return null;
  const toDate = (y: number, m: number, d: number) => (validYmd(y, m, d) ? spStartOfDay(ymdKey(y, m, d)) : null);

  if (typeof raw === "number") {
    if (raw >= 19900101 && raw <= 21001231 && Number.isInteger(raw)) {
      const s = String(raw);
      return toDate(Number(s.slice(0, 4)), Number(s.slice(4, 6)), Number(s.slice(6, 8)));
    }
    const p = parseExcelDateCode(raw);
    return p ? toDate(p.y, p.m, p.d) : null;
  }

  let s = String(raw).trim();
  if (!s) return null;
  // Bancos que escrevem a data por extenso colocam o dia da semana na frente ("Sexta, 31 de julho
  // de 2026", "Sex, 31/07/2026", "segunda-feira 05/10/2026"): tira esse prefixo e lê o resto.
  s = s
    .replace(
      /^(?:segunda|terca|terça|quarta|quinta|sexta|sabado|sábado|domingo|seg|ter|qua|qui|sex|sab|sáb|dom)(?:-feira)?\.?[\s,\-–]*(?=\d)/i,
      ""
    )
    .trim();

  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T\s].*)?$/.exec(s);
  if (m) return toDate(Number(m[1]), Number(m[2]), Number(m[3]));

  m = /^(\d{4})(\d{2})(\d{2})(?:\d{0,6}.*)?$/.exec(s);
  if (m && s.length >= 8 && /^\d+/.test(s) && !/[/.\-]/.test(s.slice(0, 8))) {
    const r = toDate(Number(m[1]), Number(m[2]), Number(m[3]));
    if (r) return r;
  }

  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})(?:[T\s,].*)?$/.exec(s);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    const year = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    return order === "MDY" ? toDate(year, a, b) : toDate(year, b, a);
  }

  // "1 de outubro de 2026", "01 out 2026", "01-out-2026"
  const norm = s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
  m = /^(\d{1,2})[\s\-/.]*(?:de\s+)?([a-z]{3,9})\.?[\s\-/.]*(?:de\s+)?(\d{2}|\d{4})(?:\D.*)?$/.exec(norm);
  if (m) {
    const month = MONTHS_PT[m[2].slice(0, 3)];
    if (month) {
      const year = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
      return toDate(year, month, Number(m[1]));
    }
  }
  return null;
}

/** Descobre se o arquivo usa dia/mês ou mês/dia olhando datas "a/b/c" sem ambiguidade. */
export function detectDateOrder(cells: Cell[]): DateOrder {
  for (const c of cells) {
    if (typeof c !== "string") continue;
    const m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})/.exec(c.trim());
    if (!m) continue;
    if (Number(m[1]) > 12) return "DMY";
    if (Number(m[2]) > 12) return "MDY";
  }
  return "DMY";
}

/** Convenção decimal do arquivo: "," (1.234,56 — padrão brasileiro) ou "." (1,234.56). */
export function detectDecimal(cells: Cell[]): "," | "." {
  for (const c of cells) {
    if (typeof c !== "string") continue;
    const s = c.trim();
    if (/,\d{1,2}(?:\s*[a-zA-Z]{0,2}|\)|-)?$/.test(s) && !/\.\d{1,2}$/.test(s)) return ",";
    if (/\.\d{1,2}(?:\s*[a-zA-Z]{0,2}|\)|-)?$/.test(s) && !/,\d{1,2}$/.test(s)) return ".";
  }
  return ",";
}

/**
 * Converte um valor em número COM SINAL (negativo = saída), entendendo: -10, (10), 10-, 10 D / 10 C,
 * "R$ 1.234,56", "1,234.56", "−10,00" (menos tipográfico). Devolve null se não for um valor.
 */
export function parseMoney(raw: Cell | undefined, decimal: "," | "." = ","): number | null {
  if (raw === undefined || raw === null) return null;
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;

  let s = String(raw).trim().replace(/[ \s]+/g, " ");
  if (!s) return null;

  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1).trim();
  }
  s = s.replace(/[−–]/g, "-");
  const suffix = /\s*(db|deb|debito|débito|d|cr|cred|credito|crédito|c)\.?$/i.exec(s);
  if (suffix && /\d/.test(s.slice(0, suffix.index))) {
    const word = suffix[1].toLowerCase();
    if (word === "d" || word === "db" || word === "deb" || word.startsWith("deb") || word.startsWith("déb")) negative = true;
    s = s.slice(0, suffix.index).trim();
  }
  s = s.replace(/r\$/gi, "").trim();
  if (s.endsWith("-")) {
    negative = true;
    s = s.slice(0, -1).trim();
  }
  if (s.startsWith("-")) {
    negative = true;
    s = s.slice(1).trim();
  } else if (s.startsWith("+")) {
    s = s.slice(1).trim();
  }
  if (!/^[\d.,\s]+$/.test(s) || !/\d/.test(s)) return null;
  s = s.replace(/\s/g, "");

  const hasDot = s.includes(".");
  const hasComma = s.includes(",");
  let normalized: string;
  if (hasDot && hasComma) {
    const decimalSep = s.lastIndexOf(",") > s.lastIndexOf(".") ? "," : ".";
    const thousandsSep = decimalSep === "," ? "." : ",";
    normalized = s.split(thousandsSep).join("").replace(decimalSep, ".");
  } else if (hasComma || hasDot) {
    const sep = hasComma ? "," : ".";
    const parts = s.split(sep);
    const lastLen = parts[parts.length - 1].length;
    if (parts.length > 2) {
      normalized = parts.join(""); // "1.234.567" → só milhar
    } else if (lastLen === 3 && sep !== decimal) {
      normalized = parts.join(""); // "1.234" no padrão BR (ou "1,234" no padrão US) → milhar
    } else {
      normalized = parts.join(".");
    }
  } else {
    normalized = s;
  }
  const n = Number(normalized);
  if (!Number.isFinite(n)) return null;
  return negative ? -n : n;
}

// ---------------------------------------------------------------------------
// Leitura da tabela (CSV ou planilha)
// ---------------------------------------------------------------------------

// Linha que COMEÇA como saldo/total/resumo (candidata a ser ignorada)...
const SALDO_LINE = /^\s*(s\s*a\s*l\s*d\s*o\b|saldo\b|total\b|totais\b|resumo\b)/i;
// ...e quando é inequivocamente saldo ou total ("SALDO ANTERIOR", "SALDO EM 31/08", "S A L D O", "TOTAL",
// "TOTAL DO PERÍODO"). Descrição que só começa com a palavra ("Total Express frete", "Saldo devedor
// cartão", "TOTAL PASS academia") é lançamento legítimo se tem data e valor de movimento.
const SALDO_SPECIFIC =
  /^\s*(?:s\s*a\s*l\s*d\s*o(?:\s+(?:anterior|inicial|final|atual|parcial|dispon[ií]vel|do\s+dia|bloqueado|em\s+\d{1,2}\/\d{1,2}.*))?|(?:total|totais)(?:\s+(?:do\s+|de\s+|dos\s+)?(?:per[ií]odo|geral|dia|m[eê]s|lan[cç]amentos|cr[eé]ditos|d[eé]bitos|entradas|sa[ií]das))?)\s*[:\-]?\s*$/i;

function inferLayoutFromContent(rows: Cell[][]): Layout | null {
  const sample = rows.slice(0, 200);
  const width = Math.max(0, ...sample.map((r) => r.length));
  if (width < 2) return null;
  const order = detectDateOrder(sample.flat());

  const stats = Array.from({ length: width }, (_, col) => {
    let filled = 0;
    let dates = 0;
    let money = 0;
    let textLen = 0;
    for (const r of sample) {
      const c = r[col];
      const t = cellText(c);
      if (!t) continue;
      filled++;
      textLen += t.length;
      if (parseDateCell(c, order)) dates++;
      // "valor": tem parte decimal ou sinal — evita confundir número de documento com valor.
      else if (typeof c === "number" ? !Number.isInteger(c) || c < 0 : /[.,]\d{1,2}(\s*[a-zA-Z]{0,2}|\)|-)?$/.test(t) || /^[-+(]/.test(t))
        if (parseMoney(c) !== null) money++;
    }
    return { col, filled, dates, money, avgLen: filled ? textLen / filled : 0 };
  });

  const dateCol = stats.filter((s) => s.filled >= 1 && s.dates / s.filled >= 0.6).sort((a, b) => b.dates - a.dates)[0];
  if (!dateCol) return null;
  const moneyCols = stats.filter((s) => s.col !== dateCol.col && s.filled >= 1 && s.money / s.filled >= 0.6);
  if (moneyCols.length === 0) return null;
  const textCols = stats
    .filter((s) => s.col !== dateCol.col && !moneyCols.some((m) => m.col === s.col) && s.filled > 0)
    .sort((a, b) => b.avgLen - a.avgLen);

  return {
    headerRow: null,
    date: dateCol.col,
    descriptions: textCols.slice(0, 1).map((s) => s.col),
    value: moneyCols[0].col,
    credit: null,
    debit: null,
    indicator: null,
    balance: null,
    labels: {},
  };
}

function describeLayout(layout: Layout): string {
  if (layout.headerRow === null) {
    return `sem cabeçalho (colunas reconhecidas pelo conteúdo: data na coluna ${layout.date + 1}, valor na coluna ${(layout.value ?? 0) + 1})`;
  }
  const parts = Object.entries(layout.labels)
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}: «${v}»`);
  return `cabeçalho na linha ${layout.headerRow + 1} (${parts.join(", ")})`;
}

/** Teto de linhas de uma planilha/texto de extrato (um mês grande tem poucos milhares). */
export const MAX_STATEMENT_ROWS = 50000;

export function parseTable(rows: Cell[][]): {
  transactions: StatementTransaction[];
  errors: string[];
  ignored: number;
  ignoredSamples: string[];
  layoutDescription: string;
  balanceCheck: { checked: number; matched: number } | null;
  totalsCheck: { matched: boolean; credit: number; debit: number; reportedCredit: number; reportedDebit: number } | null;
} {
  if (rows.length === 0) throw new StatementFormatError("O arquivo está vazio.");
  if (rows.length > MAX_STATEMENT_ROWS) {
    throw new StatementFormatError(
      `O arquivo tem linhas demais (mais de ${MAX_STATEMENT_ROWS.toLocaleString("pt-BR")}). Importe um período menor.`
    );
  }

  let layout = findHeaderLayout(rows);
  if (!layout) layout = inferLayoutFromContent(rows);
  if (!layout) {
    const sampleHeader = rows
      .slice(0, 12)
      .map((r) => r.map(cellText).filter(Boolean).join(" | "))
      .filter(Boolean)
      .slice(0, 4)
      .join(" / ");
    throw new StatementFormatError(
      `Não consegui identificar as colunas de data e valor neste arquivo. É preciso ter uma coluna de data e uma de valor (ou colunas separadas de crédito e débito). Primeiras linhas lidas: ${sampleHeader || "(vazio)"}. Se puder, baixe o extrato do banco em OFX, que é lido automaticamente.`
    );
  }

  const dataRows = rows.slice(layout.headerRow === null ? 0 : layout.headerRow + 1);
  const col = (k: number | null) => (k === null ? [] : dataRows.map((r) => r[k]));
  const order = detectDateOrder(col(layout.date));
  const decimal = detectDecimal([...col(layout.value), ...col(layout.credit), ...col(layout.debit)]);
  // Se a coluna de valor já traz sinal (algum negativo), o sinal manda e o indicador D/C é ignorado:
  // em extrato de adquirente/cartão, "Tipo = Débito" costuma ser a modalidade do cartão, não a
  // direção do dinheiro.
  const valueHasSigns = layout.value !== null && col(layout.value).some((c) => (parseMoney(c, decimal) ?? 0) < 0);
  const useIndicator = layout.indicator !== null && !valueHasSigns;

  const transactions: StatementTransaction[] = [];
  const errors: string[] = [];
  let ignored = 0;
  const ignoredSamples: string[] = [];
  // Conferência de saldo (só se o arquivo tem coluna de saldo): parte do saldo inicial impresso no
  // extrato ("SALDO ANTERIOR"/"SALDO EM 31/08"), soma os lançamentos e compara com cada saldo que o
  // banco imprime. Em centavos inteiros pra não acumular erro de ponto flutuante.
  const toCents = (n: number) => Math.round(n * 100);
  let openingCents: number | null = null;
  let runningCents = 0;
  let checked = 0;
  let matched = 0;
  // Linha "TOTAL" do arquivo (créditos e débitos somados pelo banco), pra conferir com o que foi lido.
  let reportedTotals = null as { credit: number; debit: number } | null;
  const compareBalance = (row: Cell[]) => {
    if (layout!.balance === null || openingCents === null) return;
    const bal = parseMoney(row[layout!.balance], decimal);
    if (bal === null) return;
    checked++;
    if (toCents(bal) === openingCents + runningCents) matched++;
  };
  const firstRowNumber = layout.headerRow === null ? 1 : layout.headerRow + 2;

  dataRows.forEach((row, idx) => {
    if (!row || row.every((c) => cellText(c) === "")) return;
    const lineNo = firstRowNumber + idx;

    const description = layout!.descriptions
      .map((d) => cellText(row[d]).replace(/\s+/g, " "))
      .filter((t, i, arr) => t && arr.indexOf(t) === i)
      .join(" - ");

    const dateCellText = cellText(row[layout!.date]);
    const startsLikeBalance = SALDO_LINE.test(description) || SALDO_LINE.test(dateCellText);
    const hasMovement = [layout!.value, layout!.credit, layout!.debit].some((k) => {
      if (k === null) return false;
      const v = parseMoney(row[k], decimal);
      return v !== null && v !== 0;
    });
    const isBalanceLine =
      startsLikeBalance &&
      (SALDO_SPECIFIC.test(description) || SALDO_SPECIFIC.test(dateCellText) || !parseDateCell(row[layout!.date], order) || !hasMovement);
    if (isBalanceLine) {
      ignored++;
      if (ignoredSamples.length < 5 && !ignoredSamples.includes(description || dateCellText)) ignoredSamples.push(description || dateCellText);
      if (/^\s*(total|totais)\b/i.test(description) || /^\s*(total|totais)\b/i.test(dateCellText)) {
        const c = layout!.credit !== null ? parseMoney(row[layout!.credit], decimal) : null;
        const d = layout!.debit !== null ? parseMoney(row[layout!.debit], decimal) : null;
        if (c !== null && d !== null) reportedTotals = { credit: Math.abs(c), debit: Math.abs(d) };
      }
      if (layout!.balance !== null) {
        const bal = parseMoney(row[layout!.balance], decimal);
        if (bal !== null) {
          if (openingCents === null && transactions.length === 0) openingCents = toCents(bal);
          else compareBalance(row);
        }
      }
      return;
    }

    const date = parseDateCell(row[layout!.date], order);
    if (!date) {
      const others = row.filter((_, i) => i !== layout!.date).map(cellText);
      // Rodapé/linha solta sem data e sem valor: ignora; linha com valor mas data ruim: avisa.
      const hasAmount = [layout!.value, layout!.credit, layout!.debit].some(
        (k) => k !== null && parseMoney(row[k], decimal) !== null && parseMoney(row[k], decimal) !== 0
      );
      if (!hasAmount || others.every((t) => t === "")) ignored++;
      else errors.push(`Linha ${lineNo}: data inválida ("${cellText(row[layout!.date])}").`);
      return;
    }

    let signed: number | null = null;
    if (layout!.credit !== null || layout!.debit !== null) {
      const credit = layout!.credit !== null ? parseMoney(row[layout!.credit], decimal) : null;
      const debit = layout!.debit !== null ? parseMoney(row[layout!.debit], decimal) : null;
      if (credit && debit) {
        errors.push(`Linha ${lineNo}: crédito e débito preenchidos ao mesmo tempo.`);
        return;
      }
      if (credit) signed = Math.abs(credit);
      else if (debit) signed = -Math.abs(debit);
      else if (credit === 0 || debit === 0) signed = 0; // "0,00" nas duas colunas: sem movimento
    }
    if (signed === null && layout!.value !== null) {
      const v = parseMoney(row[layout!.value], decimal);
      if (v !== null) {
        signed = v;
        if (useIndicator) {
          const dir = indicatorDirection(cellText(row[layout!.indicator!]));
          if (dir) signed = dir === "SAIDA" ? -Math.abs(v) : Math.abs(v);
        }
      }
    }

    if (signed === null) {
      errors.push(`Linha ${lineNo}: nenhum valor encontrado.`);
      return;
    }
    if (signed === 0) {
      ignored++;
      return;
    }

    transactions.push({
      date,
      descricao: description || "Sem descrição",
      direction: signed >= 0 ? "ENTRADA" : "SAIDA",
      valor: Math.abs(Math.round(signed * 100) / 100),
    });
    runningCents += toCents(signed);
    compareBalance(row);
  });

  const base = describeLayout(layout);
  const extras: string[] = [];
  if (decimal === ".") extras.push("valores com ponto decimal");
  if (order === "MDY") extras.push("datas no formato mês/dia");
  return {
    transactions,
    errors,
    ignored,
    ignoredSamples,
    layoutDescription: [base, ...extras].join(" · "),
    balanceCheck: layout.balance !== null && openingCents !== null && checked > 0 ? { checked, matched } : null,
    totalsCheck: (() => {
      if (!reportedTotals) return null;
      const credit = transactions.filter((t) => t.direction === "ENTRADA").reduce((a, t) => a + Math.round(t.valor * 100), 0);
      const debit = transactions.filter((t) => t.direction === "SAIDA").reduce((a, t) => a + Math.round(t.valor * 100), 0);
      return {
        matched: credit === Math.round(reportedTotals.credit * 100) && debit === Math.round(reportedTotals.debit * 100),
        credit: credit / 100,
        debit: debit / 100,
        reportedCredit: reportedTotals.credit,
        reportedDebit: reportedTotals.debit,
      };
    })(),
  };
}

export function describeTotalsCheck(check: ParsedStatement["totalsCheck"]): string {
  if (!check) return "";
  const fmt = (n: number) => n.toLocaleString("pt-BR", { minimumFractionDigits: 2 });
  if (check.matched) return " · conferência de totais: créditos e débitos lidos batem com a linha TOTAL do arquivo";
  return ` · ATENÇÃO conferência de totais: lido ${fmt(check.credit)} de crédito e ${fmt(check.debit)} de débito, mas a linha TOTAL do arquivo diz ${fmt(check.reportedCredit)} e ${fmt(check.reportedDebit)} — confira se o arquivo foi lido corretamente`;
}

export function describeBalanceCheck(check: { checked: number; matched: number } | null): string {
  if (!check) return "";
  if (check.matched === check.checked) {
    return ` · conferência de saldo: ${check.matched} de ${check.checked} saldos do extrato batem com a soma dos lançamentos`;
  }
  return ` · ATENÇÃO conferência de saldo: só ${check.matched} de ${check.checked} saldos do extrato batem com a soma dos lançamentos — confira se o arquivo foi lido corretamente`;
}

// ---------------------------------------------------------------------------
// OFX
// ---------------------------------------------------------------------------

function decodeOfxBuffer(buffer: Buffer): string {
  const utf8Text = buffer.toString("utf-8");
  const text = utf8Text.includes("�") ? buffer.toString("latin1") : utf8Text;
  // Alguns bancos exportam o OFX 1.x inteiro (ou blocos grandes) numa linha só, sem quebra entre as
  // tags. A biblioteca lê bem "um campo por linha", então garante uma quebra antes de cada tag
  // (valores de OFX nunca contêm "<", então é seguro).
  // Só no OFX 1.x (SGML, que começa com "OFXHEADER:"): no OFX 2.x (XML) a biblioteca lê o texto
  // como está, e quebrar linha antes de cada tag (inclusive </MEMO>, <?xml) faz ele não achar nada.
  if (/OFXHEADER\s*:/i.test(text.slice(0, 500))) return text.replace(/[ \t]*<(?=\/?[A-Za-z?])/g, "\n<");
  return text;
}

function parseOfx(buffer: Buffer): { transactions: StatementTransaction[]; errors: string[] } {
  const errors: string[] = [];
  const transactions: StatementTransaction[] = [];

  let list: NormalizedTransaction[];
  try {
    const extractor = new Extractor().data(new Reader(decodeOfxBuffer(buffer))).config({ parserMode: "lenient" });
    list = extractor.toNormalized({ amountMode: "number", dateMode: "date" }).transactions;
  } catch (err) {
    throw new StatementFormatError(
      `Não foi possível interpretar o arquivo OFX (${err instanceof Error ? err.message : "erro desconhecido"}).`
    );
  }

  list.forEach((t, idx) => {
    const label = `Transação ${idx + 1}`;
    const posted = t.postedAt instanceof Date && !Number.isNaN(t.postedAt.getTime()) ? t.postedAt : null;
    if (!posted) {
      errors.push(`${label}: data inválida ("${String(t.raw?.DTPOSTED ?? "")}").`);
      return;
    }
    // A biblioteca devolve o dia do OFX como meia-noite UTC; a tela formata no fuso do navegador
    // (São Paulo), o que mostraria o dia ANTERIOR. Reancora o mesmo dia do calendário em meia-noite
    // de São Paulo, igual CSV/Excel/PDF.
    const date = spStartOfDay(
      `${posted.getUTCFullYear()}-${String(posted.getUTCMonth() + 1).padStart(2, "0")}-${String(posted.getUTCDate()).padStart(2, "0")}`
    );
    const valor = typeof t.amount === "number" ? t.amount : NaN;
    if (Number.isNaN(valor) || valor === 0) {
      errors.push(`${label}: valor inválido ("${String(t.raw?.TRNAMT ?? "")}").`);
      return;
    }
    transactions.push({
      date,
      descricao: (t.description ?? "").trim() || "Sem descrição",
      direction: valor >= 0 ? "ENTRADA" : "SAIDA",
      valor: Math.abs(valor),
    });
  });
  return { transactions, errors };
}

// ---------------------------------------------------------------------------
// Entrada principal
// ---------------------------------------------------------------------------

export async function parseBankStatement(buffer: Buffer): Promise<ParsedStatement> {
  const kind = detectKind(buffer);

  switch (kind) {
    case "PDF": {
      let pages;
      try {
        pages = await readPdfPages(buffer);
      } catch (err) {
        if (err instanceof PdfTooLargeError) {
          throw new StatementFormatError(
            "Este PDF é grande demais para importar de uma vez. Baixe o extrato de um período menor (por exemplo, um mês) ou, melhor, em OFX."
          );
        }
        throw new StatementFormatError(
          "Não consegui abrir este PDF (pode estar protegido por senha ou corrompido). Baixe o extrato do banco novamente, de preferência em OFX."
        );
      }
      if (pages.every((p) => p.length === 0)) {
        throw new StatementFormatError(
          "Este PDF não tem texto (parece escaneado ou uma foto), então não consigo ler. Baixe o extrato digital do banco, de preferência em OFX."
        );
      }
      const table = pdfPagesToTable(pages, (t) => roleOfHeader(t));
      if (!table) {
        throw new StatementFormatError(
          "Não encontrei a tabela de movimentações neste PDF (colunas de data, descrição e valor, ou crédito e débito). Se for um extrato, baixe-o em OFX, que é lido direto."
        );
      }
      const parsed = parseTable(table.rows);
      return {
        format: "PDF",
        transactions: parsed.transactions,
        errors: parsed.errors,
        ignored: parsed.ignored,
        ignoredSamples: parsed.ignoredSamples,
        balanceCheck: parsed.balanceCheck,
        totalsCheck: parsed.totalsCheck,
        detected: `PDF de extrato (texto) · ${table.note} · ${parsed.layoutDescription}${describeBalanceCheck(parsed.balanceCheck)}${describeTotalsCheck(parsed.totalsCheck)}`,
      };
    }
    case "XLS":
      throw new StatementFormatError(
        "Este é um Excel antigo (.xls). Abra no Excel e use Salvar como > Pasta de Trabalho do Excel (.xlsx), ou baixe o extrato do banco em OFX ou CSV."
      );
    case "IMAGE":
      throw new StatementFormatError("Este arquivo é uma imagem. Envie o extrato em OFX, CSV ou Excel (.xlsx).");
    case "ZIP":
      throw new StatementFormatError("Este arquivo é compactado (ZIP). Extraia o arquivo e envie o extrato em OFX, CSV ou Excel (.xlsx).");
    case "CNAB":
      throw new StatementFormatError(
        "Este arquivo parece ser CNAB (remessa/retorno bancário), não um extrato. Baixe o extrato do banco em OFX, CSV ou Excel (.xlsx)."
      );
    case "OFX": {
      const { transactions, errors } = parseOfx(buffer);
      return {
        format: "OFX",
        transactions,
        errors,
        ignored: 0,
        ignoredSamples: [],
        balanceCheck: null,
        totalsCheck: null,
        detected: "OFX (extrato bancário padrão), lido automaticamente",
      };
    }
    case "XLSX": {
      let rows: Cell[][];
      try {
        rows = await readWorkbookRows(buffer);
      } catch {
        throw new StatementFormatError("Não consegui abrir esta planilha Excel. Confira se o arquivo não está corrompido ou protegido por senha.");
      }
      const parsed = parseTable(rows);
      return {
        format: "XLSX",
        transactions: parsed.transactions,
        errors: parsed.errors,
        ignored: parsed.ignored,
        ignoredSamples: parsed.ignoredSamples,
        balanceCheck: parsed.balanceCheck,
        totalsCheck: parsed.totalsCheck,
        detected: `Planilha Excel (.xlsx) · ${parsed.layoutDescription}${describeBalanceCheck(parsed.balanceCheck)}${describeTotalsCheck(parsed.totalsCheck)}`,
      };
    }
    default: {
      const { text, encoding } = decodeText(buffer);
      const delimiter = detectDelimiter(text);
      const rows = parseDelimited(text, delimiter);
      if (rows.length === 0) throw new StatementFormatError("O arquivo está vazio ou não tem linhas de dados.");
      const parsed = parseTable(rows);
      const delimiterName = delimiter === "\t" ? "tabulação" : `"${delimiter}"`;
      return {
        format: "CSV",
        transactions: parsed.transactions,
        errors: parsed.errors,
        ignored: parsed.ignored,
        ignoredSamples: parsed.ignoredSamples,
        balanceCheck: parsed.balanceCheck,
        totalsCheck: parsed.totalsCheck,
        detected: `Texto/CSV · separador ${delimiterName} · acentuação ${encoding} · ${parsed.layoutDescription}${describeBalanceCheck(parsed.balanceCheck)}${describeTotalsCheck(parsed.totalsCheck)}`,
      };
    }
  }
}
