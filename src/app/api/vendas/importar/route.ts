import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { requireActiveSingleEmpresa } from "@/lib/empresa";
import * as XLSX from "xlsx";

const HEADER_ALIASES: Record<string, string> = {
  data: "date",
  dia: "date",
  faturamentodelivery: "faturamentoDelivery",
  fatdelivery: "faturamentoDelivery",
  delivery: "faturamentoDelivery",
  faturamentosalao: "faturamentoSalao",
  fatsalao: "faturamentoSalao",
  salao: "faturamentoSalao",
  pedidosdelivery: "pedidosDelivery",
  pedidosbalcao: "pedidosBalcao",
  pedidossalao: "pedidosSalao",
  mesas: "mesasAtendidas",
  mesasatendidas: "mesasAtendidas",
  taxaservico: "taxaServicoValor",
  taxadeservico: "taxaServicoValor",
  metadiaria: "metaDiaria",
  meta: "metaDiaria",
  observacoes: "observacoes",
  obs: "observacoes",
};

const NUMERIC_FIELDS = [
  "faturamentoDelivery",
  "faturamentoSalao",
  "pedidosDelivery",
  "pedidosBalcao",
  "pedidosSalao",
  "mesasAtendidas",
  "taxaServicoValor",
  "metaDiaria",
] as const;

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

function parseNumber(raw: string | number): number {
  if (typeof raw === "number") return raw;
  const cleaned = String(raw ?? "").trim().replace(/[^\d,.-]/g, "");
  if (!cleaned) return 0;
  const normalized =
    cleaned.includes(",") && cleaned.lastIndexOf(",") > cleaned.lastIndexOf(".")
      ? cleaned.replace(/\./g, "").replace(",", ".")
      : cleaned.replace(/,/g, "");
  const value = Number(normalized);
  return Number.isNaN(value) ? 0 : value;
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
      { error: "Selecione uma loja específica (não é possível importar vendas no modo Grupo Nord)." },
      { status: 400 }
    );
  }

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "Arquivo não informado." }, { status: 400 });

  const buffer = Buffer.from(await file.arrayBuffer());
  const isSpreadsheet = /\.xlsx?$/i.test(file.name);

  let rows: (string | number)[][];
  try {
    rows = isSpreadsheet ? rowsFromWorkbook(buffer) : rowsFromCsvText(buffer.toString("utf-8"));
  } catch {
    return NextResponse.json({ error: "Não foi possível ler o arquivo. Confira se é um .xlsx ou .csv válido." }, { status: 400 });
  }

  if (rows.length < 2) {
    return NextResponse.json({ error: "Arquivo vazio ou sem linhas de dados." }, { status: 400 });
  }

  const headerRow = rows[0].map((h) => normalizeHeader(String(h)));
  const columnMap: Record<string, number> = {};
  headerRow.forEach((h, idx) => {
    const mapped = HEADER_ALIASES[h];
    if (mapped && columnMap[mapped] === undefined) columnMap[mapped] = idx;
  });

  if (columnMap.date === undefined) {
    return NextResponse.json(
      {
        error:
          'Cabeçalho inválido. A planilha precisa de uma coluna "Data" e ao menos uma coluna de faturamento ou pedidos (ex.: "Faturamento Delivery", "Faturamento Salão", "Pedidos Delivery"...).',
      },
      { status: 400 }
    );
  }

  const errors: string[] = [];
  const parsedRows: { date: Date; values: Record<string, number>; observacoes: string | null }[] = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.every((c) => String(c).trim() === "")) continue;

    const rawDate = row[columnMap.date];
    const date = parseDateFlexible(rawDate);
    if (!date) {
      errors.push(`Linha ${i + 1}: data inválida ("${rawDate}").`);
      continue;
    }

    const values: Record<string, number> = {};
    for (const field of NUMERIC_FIELDS) {
      const idx = columnMap[field];
      values[field] = idx !== undefined ? parseNumber(row[idx]) : 0;
    }

    const obsIdx = columnMap.observacoes;
    const observacoes = obsIdx !== undefined ? String(row[obsIdx] ?? "").trim() || null : null;

    parsedRows.push({ date, values, observacoes });
  }

  if (parsedRows.length === 0) {
    return NextResponse.json({ error: "Nenhuma linha válida encontrada no arquivo.", errors }, { status: 400 });
  }

  let created = 0;
  let updated = 0;

  for (const row of parsedRows) {
    const data = {
      faturamentoDelivery: row.values.faturamentoDelivery,
      faturamentoSalao: row.values.faturamentoSalao,
      pedidosDelivery: row.values.pedidosDelivery,
      pedidosBalcao: row.values.pedidosBalcao,
      pedidosSalao: row.values.pedidosSalao,
      mesasAtendidas: row.values.mesasAtendidas,
      taxaServicoValor: row.values.taxaServicoValor,
      metaDiaria: row.values.metaDiaria,
      observacoes: row.observacoes,
      source: "IMPORTADO" as const,
      createdById: session.user.id,
    };

    const existing = await prisma.salesEntry.findFirst({
      where: { empresaId: empresa.id, date: row.date, periodType: "DIARIO" },
      select: { id: true },
    });

    if (existing) {
      await prisma.salesEntry.update({ where: { id: existing.id }, data });
      updated += 1;
    } else {
      await prisma.salesEntry.create({ data: { empresaId: empresa.id, date: row.date, periodType: "DIARIO", ...data } });
      created += 1;
    }
  }

  await prisma.auditLog.create({
    data: {
      userId: session.user.id,
      empresaId: empresa.id,
      action: "IMPORT",
      entityType: "SalesEntry",
      entityId: file.name,
      after: JSON.stringify({ fileName: file.name, created, updated, errors: errors.length }),
    },
  });

  return NextResponse.json({ created, updated, errors });
}
