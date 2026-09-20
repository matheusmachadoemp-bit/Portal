import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { requireActiveSingleEmpresa } from "@/lib/empresa";
import { hasModulePermission } from "@/lib/authz";
import * as XLSX from "xlsx";
import { Extractor, Reader, type NormalizedTransaction } from "ofx-data-extractor";

const HEADER_ALIASES: Record<string, string> = {
  data: "data",
  dia: "data",
  descricao: "descricao",
  historico: "descricao",
  lancamento: "descricao",
  valor: "valor",
  entrada: "entrada",
  saida: "saida",
  credito: "entrada",
  debito: "saida",
};

function normalizeHeader(h: string): string {
  return h
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function parseDateFlexible(raw: string | number): Date | null {
  if (typeof raw === "number") {
    const parsed = XLSX.SSF.parse_date_code(raw);
    if (!parsed) return null;
    return new Date(Date.UTC(parsed.y, parsed.m - 1, parsed.d));
  }
  const s = String(raw).trim();
  const br = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(s);
  if (br) {
    const year = br[3].length === 2 ? Number(`20${br[3]}`) : Number(br[3]);
    return new Date(Date.UTC(year, Number(br[2]) - 1, Number(br[1])));
  }
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (iso) return new Date(Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])));
  return null;
}

function parseValor(raw: string): number {
  const cleaned = String(raw).trim().replace(/[^\d,.-]/g, "");
  if (!cleaned) return NaN;
  const normalized =
    cleaned.includes(",") && cleaned.lastIndexOf(",") > cleaned.lastIndexOf(".")
      ? cleaned.replace(/\./g, "").replace(",", ".")
      : cleaned.replace(/,/g, "");
  return Number(normalized);
}

function rowsFromCsvText(text: string): string[][] {
  const delimiter = text.includes(";") ? ";" : ",";
  return text
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .map((line) => line.split(delimiter).map((cell) => cell.trim().replace(/^"|"$/g, "")));
}

function rowsFromWorkbook(buffer: Buffer): (string | number)[][] {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  return XLSX.utils.sheet_to_json<(string | number)[]>(sheet, { header: 1, raw: true, defval: "" });
}

// Bancos brasileiros costumam exportar OFX 1.x (SGML) em CP1252/ISO-8859-1 — o
// campo CHARSET:1252 no cabeçalho é o indicativo disso, mas alguns arquivos
// trazem ENCODING:USASCII mesmo contendo acentuação fora da faixa ASCII. Em vez
// de confiar cegamente no cabeçalho, tenta UTF-8 primeiro e, se aparecer o
// caractere de substituição (indicando bytes inválidos em UTF-8), refaz como
// latin1 — que cobre tanto ISO-8859-1 quanto a maior parte de CP1252 usada em
// texto de extrato bancário (letras acentuadas, ç, etc.).
function decodeOfxBuffer(buffer: Buffer): string {
  const utf8Text = buffer.toString("utf-8");
  return utf8Text.includes("�") ? buffer.toString("latin1") : utf8Text;
}

// Detecta OFX pela extensão do arquivo e, de forma complementar, pelo conteúdo
// (todo OFX começa com "OFXHEADER:" no formato 1.x/SGML ou contém a tag <OFX>
// logo no início no formato 2.x/XML) — cobre o caso de o usuário salvar o
// extrato com outra extensão (ex.: .txt).
function isOfxFile(fileName: string, buffer: Buffer): boolean {
  if (/\.ofx$/i.test(fileName)) return true;
  const head = buffer.subarray(0, 100).toString("latin1").toUpperCase();
  return head.includes("OFXHEADER") || head.includes("<OFX>");
}

type ParsedTransactionRow = { date: Date; descricao: string; direction: "ENTRADA" | "SAIDA"; valor: number };

// Parseia um extrato em OFX (1.x/SGML ou 2.x/XML) usando a biblioteca
// ofx-data-extractor, que já normaliza a árvore SGML->XML (inclusive tags sem
// fechamento, comuns em exportações de banco) e sempre devolve uma lista de
// transações (mesmo com uma única <STMTTRN> no arquivo). Cada <STMTTRN> vira
// um item com `postedAt` (de DTPOSTED), `amount` (de TRNAMT, negativo =
// saída/débito, positivo = entrada/crédito) e `description` (MEMO, com
// fallback pra NAME quando MEMO não vem preenchido). O modo "lenient" evita
// que uma transação malformada quebre o arquivo inteiro: o campo problemático
// vem como null e é reportado como erro daquela transação, sem descartar as
// demais.
function parseOfxTransactions(buffer: Buffer): { parsedRows: ParsedTransactionRow[]; errors: string[] } {
  const errors: string[] = [];
  const parsedRows: ParsedTransactionRow[] = [];

  let transactions: NormalizedTransaction[];
  try {
    const text = decodeOfxBuffer(buffer);
    const extractor = new Extractor().data(new Reader(text)).config({ parserMode: "lenient" });
    transactions = extractor.toNormalized({ amountMode: "number", dateMode: "date" }).transactions;
  } catch (err) {
    errors.push(
      `Não foi possível interpretar o arquivo OFX (${err instanceof Error ? err.message : "erro desconhecido"}).`
    );
    return { parsedRows, errors };
  }

  transactions.forEach((t, idx) => {
    const label = `Transação ${idx + 1}`;

    const date = t.postedAt instanceof Date ? t.postedAt : null;
    if (!date || Number.isNaN(date.getTime())) {
      errors.push(`${label}: data inválida ("${String(t.raw?.DTPOSTED ?? "")}").`);
      return;
    }

    const valor = typeof t.amount === "number" ? t.amount : NaN;
    if (Number.isNaN(valor) || valor === 0) {
      errors.push(`${label}: valor inválido ("${String(t.raw?.TRNAMT ?? "")}").`);
      return;
    }

    const descricao = (t.description ?? "").trim() || "Sem descrição";
    const direction: "ENTRADA" | "SAIDA" = valor >= 0 ? "ENTRADA" : "SAIDA";
    parsedRows.push({ date, descricao, direction, valor: Math.abs(valor) });
  });

  return { parsedRows, errors };
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModulePermission(session.user.id, "financeiro", "canCreate"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite importar extratos bancários." },
      { status: 403 }
    );
  }

  const empresa = await requireActiveSingleEmpresa();
  if (!empresa) {
    return NextResponse.json(
      { error: "Selecione uma loja específica (não é possível importar no modo Grupo Nord)." },
      { status: 400 }
    );
  }

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const bankAccountId = formData.get("bankAccountId") as string | null;
  if (!file) return NextResponse.json({ error: "Arquivo não informado." }, { status: 400 });
  if (!bankAccountId) return NextResponse.json({ error: "Selecione a conta bancária do extrato." }, { status: 400 });

  const bankAccount = await prisma.bankAccount.findFirst({
    where: { id: bankAccountId, empresaId: empresa.id },
  });
  if (!bankAccount) return NextResponse.json({ error: "Conta bancária inválida." }, { status: 400 });

  const buffer = Buffer.from(await file.arrayBuffer());
  const isSpreadsheet = /\.xlsx$/i.test(file.name);
  const isOfx = !isSpreadsheet && isOfxFile(file.name, buffer);

  const errors: string[] = [];
  const parsedRows: ParsedTransactionRow[] = [];

  if (isOfx) {
    const ofxResult = parseOfxTransactions(buffer);
    parsedRows.push(...ofxResult.parsedRows);
    errors.push(...ofxResult.errors);
  } else {
    let rows: (string | number)[][];
    if (isSpreadsheet) {
      rows = rowsFromWorkbook(buffer);
    } else {
      rows = rowsFromCsvText(buffer.toString("utf-8"));
    }

    if (rows.length < 2) {
      return NextResponse.json({ error: "Arquivo vazio ou sem linhas de dados." }, { status: 400 });
    }

    const headerRow = rows[0].map((h) => normalizeHeader(String(h)));
    const columnMap: Record<string, number> = {};
    headerRow.forEach((h, idx) => {
      const mapped = HEADER_ALIASES[h];
      if (mapped) columnMap[mapped] = idx;
    });

    if (columnMap.data === undefined || (columnMap.valor === undefined && columnMap.entrada === undefined && columnMap.saida === undefined)) {
      return NextResponse.json(
        {
          error:
            'Cabeçalho inválido. Esperado: data, descrição e valor (ou colunas separadas "entrada"/"saida").',
        },
        { status: 400 }
      );
    }

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.every((c) => String(c).trim() === "")) continue;

      const get = (key: string) => (columnMap[key] !== undefined ? String(row[columnMap[key]] ?? "").trim() : "");

      const rawDate = columnMap.data !== undefined ? row[columnMap.data] : "";
      const date = parseDateFlexible(rawDate);
      if (!date) {
        errors.push(`Linha ${i + 1}: data inválida ("${rawDate}").`);
        continue;
      }

      const descricao = get("descricao") || "Sem descrição";

      let direction: "ENTRADA" | "SAIDA";
      let valor: number;
      if (columnMap.valor !== undefined) {
        valor = parseValor(get("valor"));
        if (Number.isNaN(valor) || valor === 0) {
          errors.push(`Linha ${i + 1}: valor inválido.`);
          continue;
        }
        direction = valor >= 0 ? "ENTRADA" : "SAIDA";
        valor = Math.abs(valor);
      } else {
        const entradaRaw = get("entrada");
        const saidaRaw = get("saida");
        if (entradaRaw) {
          valor = Math.abs(parseValor(entradaRaw));
          direction = "ENTRADA";
        } else if (saidaRaw) {
          valor = Math.abs(parseValor(saidaRaw));
          direction = "SAIDA";
        } else {
          errors.push(`Linha ${i + 1}: nenhum valor de entrada ou saída informado.`);
          continue;
        }
        if (Number.isNaN(valor) || valor === 0) {
          errors.push(`Linha ${i + 1}: valor inválido.`);
          continue;
        }
      }

      parsedRows.push({ date, descricao, direction, valor });
    }
  }

  if (parsedRows.length === 0) {
    return NextResponse.json({ error: "Nenhuma linha válida encontrada no arquivo.", errors }, { status: 400 });
  }

  const totalEntradas = parsedRows.filter((r) => r.direction === "ENTRADA").reduce((s, r) => s + r.valor, 0);
  const totalSaidas = parsedRows.filter((r) => r.direction === "SAIDA").reduce((s, r) => s + r.valor, 0);

  const result = await prisma.bankReconciliationImport.create({
    data: {
      empresaId: empresa.id,
      bankAccountId,
      fileName: file.name,
      totalEntradas,
      totalSaidas,
      totalLinhas: parsedRows.length,
      createdById: session.user.id,
      transactions: {
        create: parsedRows.map((r) => ({
          empresaId: empresa.id,
          bankAccountId,
          date: r.date,
          descricao: r.descricao,
          direction: r.direction,
          valor: r.valor,
        })),
      },
    },
  });

  return NextResponse.json({ import: result, imported: parsedRows.length, errors });
}
