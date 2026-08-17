import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { requireActiveSingleEmpresa } from "@/lib/empresa";
import { computeHorasTrabalhadas, timeToMinutes } from "@/lib/rh-helpers";
import * as XLSX from "xlsx";

const HEADER_ALIASES: Record<string, string> = {
  colaborador: "colaborador",
  funcionario: "colaborador",
  nome: "colaborador",
  data: "data",
  entrada: "entrada",
  saidaalmoco: "saidaAlmoco",
  saidaparaalmoco: "saidaAlmoco",
  retornoalmoco: "retornoAlmoco",
  retornodoalmoco: "retornoAlmoco",
  saida: "saida",
  atraso: "atraso",
  atrasominutos: "atraso",
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
    // Excel serial date
    const parsed = XLSX.SSF.parse_date_code(raw);
    if (!parsed) return null;
    return new Date(Date.UTC(parsed.y, parsed.m - 1, parsed.d));
  }
  const s = String(raw).trim();
  const br = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (br) return new Date(Date.UTC(Number(br[3]), Number(br[2]) - 1, Number(br[1])));
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (iso) return new Date(Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])));
  return null;
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
  const fixedEmployeeId = (formData.get("employeeId") as string | null) || null;
  if (!file) return NextResponse.json({ error: "Arquivo não informado." }, { status: 400 });

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

  if (columnMap.data === undefined || columnMap.entrada === undefined) {
    return NextResponse.json(
      { error: "Cabeçalho inválido. Esperado: colaborador (opcional), data, entrada, saida_almoco, retorno_almoco, saida." },
      { status: 400 }
    );
  }

  const employees = await prisma.employee.findMany({ where: { empresaId: empresa.id } });
  const byName = new Map(employees.map((e) => [e.name.trim().toLowerCase(), e]));

  const errors: string[] = [];
  const validEntries: {
    employeeId: string;
    date: Date;
    entrada: string | null;
    saidaAlmoco: string | null;
    retornoAlmoco: string | null;
    saida: string | null;
    horasTrabalhadas: number;
    atrasoMinutos: number;
    falta: boolean;
  }[] = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.every((c) => String(c).trim() === "")) continue;

    const get = (key: string) => (columnMap[key] !== undefined ? String(row[columnMap[key]] ?? "").trim() : "");

    let employeeId = fixedEmployeeId;
    if (columnMap.colaborador !== undefined) {
      const nome = get("colaborador");
      const match = byName.get(nome.toLowerCase());
      if (!match) {
        errors.push(`Linha ${i + 1}: colaborador "${nome}" não encontrado.`);
        continue;
      }
      employeeId = match.id;
    }
    if (!employeeId) {
      errors.push(`Linha ${i + 1}: colaborador não informado.`);
      continue;
    }

    const rawDate = columnMap.data !== undefined ? row[columnMap.data] : "";
    const date = parseDateFlexible(rawDate);
    if (!date) {
      errors.push(`Linha ${i + 1}: data inválida ("${rawDate}").`);
      continue;
    }

    const entrada = get("entrada") || null;
    const saidaAlmoco = get("saidaAlmoco") || null;
    const retornoAlmoco = get("retornoAlmoco") || null;
    const saida = get("saida") || null;

    const horasTrabalhadas = computeHorasTrabalhadas({ entrada, saidaAlmoco, retornoAlmoco, saida });

    let atrasoMinutos = 0;
    const atrasoRaw = get("atraso");
    if (atrasoRaw) {
      atrasoMinutos = Number(atrasoRaw) || 0;
    } else if (entrada) {
      const padrao = timeToMinutes("08:00") ?? 0;
      const real = timeToMinutes(entrada);
      if (real !== null && real > padrao) atrasoMinutos = real - padrao;
    }

    validEntries.push({
      employeeId,
      date,
      entrada,
      saidaAlmoco,
      retornoAlmoco,
      saida,
      horasTrabalhadas,
      atrasoMinutos,
      falta: !entrada,
    });
  }

  let imported = 0;
  if (validEntries.length > 0) {
    const existing = await prisma.timeEntry.findMany({
      where: { OR: validEntries.map((e) => ({ employeeId: e.employeeId, date: e.date })) },
      select: { employeeId: true, date: true },
    });
    const existingKeys = new Set(existing.map((e) => `${e.employeeId}|${e.date.getTime()}`));
    const keyOf = (e: (typeof validEntries)[number]) => `${e.employeeId}|${e.date.getTime()}`;

    const toCreate = validEntries.filter((e) => !existingKeys.has(keyOf(e)));
    const toUpdate = validEntries.filter((e) => existingKeys.has(keyOf(e)));

    if (toCreate.length > 0) {
      await prisma.timeEntry.createMany({
        data: toCreate.map((e) => ({ ...e, empresaId: empresa.id })),
        skipDuplicates: true,
      });
    }
    if (toUpdate.length > 0) {
      await prisma.$transaction(
        toUpdate.map((e) =>
          prisma.timeEntry.update({
            where: { employeeId_date: { employeeId: e.employeeId, date: e.date } },
            data: {
              entrada: e.entrada,
              saidaAlmoco: e.saidaAlmoco,
              retornoAlmoco: e.retornoAlmoco,
              saida: e.saida,
              horasTrabalhadas: e.horasTrabalhadas,
              atrasoMinutos: e.atrasoMinutos,
              falta: e.falta,
            },
          })
        )
      );
    }
    imported = validEntries.length;
  }

  return NextResponse.json({ imported, errors });
}
