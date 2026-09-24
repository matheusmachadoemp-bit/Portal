import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { requireActiveSingleEmpresa } from "@/lib/empresa";
import { computeHorasTrabalhadas, timeToMinutes } from "@/lib/rh-helpers";
import { hasModulePermission } from "@/lib/authz";
import { parseExcelDateCode, readWorkbookRows } from "@/lib/xlsx-import";
import { spStartOfDay } from "@/lib/checklist";

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

// Task #318 (mesma classe do achado do Teulis já corrigido em POST/PATCH de ../route.ts e
// ../[id]/route.ts): devolve a chave "YYYY-MM-DD" — nunca um `Date` já convertido — pra quem grava
// decidir o instante certo via `spStartOfDay` (meia-noite de São Paulo). Antes, esta função devolvia
// `new Date(Date.UTC(y, m-1, d))` (meia-noite UTC), 3h ANTES da meia-noite de SP do mesmo dia, o que
// fazia o primeiro dia de qualquer período importado ficar fora do `gte` calculado por
// `resolveRollingPeriod`/`spMonthStart`.
function parseDateKeyFlexible(raw: string | number): string | null {
  const pad = (n: number) => String(n).padStart(2, "0");
  if (typeof raw === "number") {
    // Excel serial date
    const parsed = parseExcelDateCode(raw);
    if (!parsed) return null;
    return `${parsed.y}-${pad(parsed.m)}-${pad(parsed.d)}`;
  }
  const s = String(raw).trim();
  const br = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (br) return `${br[3]}-${pad(Number(br[2]))}-${pad(Number(br[1]))}`;
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (iso) return `${iso[1]}-${pad(Number(iso[2]))}-${pad(Number(iso[3]))}`;
  return null;
}

// A célula de horário pode chegar como number (célula nativa do Excel, sem formatação de texto —
// uma hora "pura", sem data, vira uma fração do dia: "08:00" = serial 0.3333...) ou como string já
// em "HH:MM" (arquivo exportado/editado como texto). Converte pro mesmo formato "HH:MM" que
// timeToMinutes/computeHorasTrabalhadas (@/lib/rh-helpers) esperam nos dois casos.
function parseTimeFlexible(raw: string | number): string | null {
  if (typeof raw === "number") {
    const parsed = parseExcelDateCode(raw);
    if (!parsed) return null;
    return `${String(parsed.H).padStart(2, "0")}:${String(parsed.M).padStart(2, "0")}`;
  }
  const s = raw.trim();
  return s || null;
}

function rowsFromCsvText(text: string): string[][] {
  const delimiter = text.includes(";") ? ";" : ",";
  return text
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .map((line) => line.split(delimiter).map((cell) => cell.trim().replace(/^"|"$/g, "")));
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // A planilha cria registros de ponto novos e atualiza os já existentes (match por
  // colaborador+data) na mesma chamada — trata como canCreate por ser uma importação em massa,
  // mesmo padrão usado em financeiro/conciliacao/import.
  if (!(await hasModulePermission(session.user.id, "rh", "canCreate"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite importar registros de ponto." },
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
  const fixedEmployeeId = (formData.get("employeeId") as string | null) || null;
  if (!file) return NextResponse.json({ error: "Arquivo não informado." }, { status: 400 });

  const buffer = Buffer.from(await file.arrayBuffer());
  const isSpreadsheet = /\.xlsx$/i.test(file.name);

  let rows: (string | number)[][];
  if (isSpreadsheet) {
    rows = await readWorkbookRows(buffer);
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
    // Preserva o tipo original da célula (number vs string) para os campos de horário — ver
    // parseTimeFlexible. Horários sempre por getRaw(), nunca get(): uma célula nativa do Excel
    // chega aqui como number (fração do dia), e get() já converteria isso pra string ANTES de
    // chegar em parseTimeFlexible, corrompendo o horário (mesmo padrão de
    // crm/clientes/import/route.ts para datas).
    const getRaw = (key: string): string | number =>
      columnMap[key] !== undefined ? (row[columnMap[key]] ?? "") : "";

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
    const dateKey = parseDateKeyFlexible(rawDate);
    if (!dateKey) {
      errors.push(`Linha ${i + 1}: data inválida ("${rawDate}").`);
      continue;
    }
    const date = spStartOfDay(dateKey);

    const entrada = parseTimeFlexible(getRaw("entrada"));
    const saidaAlmoco = parseTimeFlexible(getRaw("saidaAlmoco"));
    const retornoAlmoco = parseTimeFlexible(getRaw("retornoAlmoco"));
    const saida = parseTimeFlexible(getRaw("saida"));

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
      // Uma única query SQL (`UPDATE ... FROM UNNEST(...)`) em vez de
      // `prisma.$transaction(toUpdate.map((e) => prisma.timeEntry.update(...)))`
      // — a API de "sequential operations" do Prisma, que roda cada update
      // um atrás do outro dentro de uma transação interativa com timeout
      // padrão de 5s. Reimportar uma planilha de ponto de um período já
      // importado facilmente gera centenas de linhas de update (mesmo bug
      // encontrado e corrigido em `syncEmpresaSaiposSales`, ver
      // `src/lib/saipos-sync.ts`), e isso derrubaria a importação inteira
      // sem atualizar nada.
      const employeeIds = toUpdate.map((e) => e.employeeId);
      const dates = toUpdate.map((e) => e.date);
      const entradas = toUpdate.map((e) => e.entrada);
      const saidasAlmoco = toUpdate.map((e) => e.saidaAlmoco);
      const retornosAlmoco = toUpdate.map((e) => e.retornoAlmoco);
      const saidas = toUpdate.map((e) => e.saida);
      const horasTrabalhadas = toUpdate.map((e) => e.horasTrabalhadas);
      const atrasosMinutos = toUpdate.map((e) => e.atrasoMinutos);
      const faltas = toUpdate.map((e) => e.falta);

      await prisma.$executeRaw`
        UPDATE "TimeEntry" AS t
        SET
          "entrada" = v.entrada,
          "saidaAlmoco" = v.saida_almoco,
          "retornoAlmoco" = v.retorno_almoco,
          "saida" = v.saida,
          "horasTrabalhadas" = v.horas_trabalhadas,
          "atrasoMinutos" = v.atraso_minutos,
          "falta" = v.falta
        FROM UNNEST(
          ${employeeIds}::text[], ${dates}::timestamp[], ${entradas}::text[],
          ${saidasAlmoco}::text[], ${retornosAlmoco}::text[], ${saidas}::text[],
          ${horasTrabalhadas}::float8[], ${atrasosMinutos}::int[], ${faltas}::boolean[]
        ) AS v(employee_id, date, entrada, saida_almoco, retorno_almoco, saida, horas_trabalhadas, atraso_minutos, falta)
        WHERE t."employeeId" = v.employee_id AND t."date" = v.date
      `;
    }
    imported = validEntries.length;
  }

  return NextResponse.json({ imported, errors });
}
