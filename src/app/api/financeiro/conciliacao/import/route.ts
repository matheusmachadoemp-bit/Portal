import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { requireActiveSingleEmpresa } from "@/lib/empresa";
import * as XLSX from "xlsx";

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

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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

  const errors: string[] = [];
  const parsedRows: { date: Date; descricao: string; direction: "ENTRADA" | "SAIDA"; valor: number }[] = [];

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
