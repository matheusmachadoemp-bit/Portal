import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { requireActiveSingleEmpresa } from "@/lib/empresa";
import { computeCurrentAquisitivePeriod } from "@/lib/rh-helpers";
import * as XLSX from "xlsx";

// Colunas aceitas na planilha de importação de colaboradores (RH > Colaboradores).
// "Férias a vencer" não é lida como valor — o período aquisitivo vigente é sempre
// calculado pela regra da CLT a partir da data de entrada (ver computeCurrentAquisitivePeriod).
const HEADER_ALIASES: Record<string, string> = {
  nome: "name",
  nomecompleto: "name",
  nometodo: "name",
  chavepix: "pixKey",
  pix: "pixKey",
  cpf: "cpf",
  celular: "phone",
  numerocelular: "phone",
  telefone: "phone",
  telefonecelular: "phone",
  dataaniversario: "birthDate",
  aniversario: "birthDate",
  datadenascimento: "birthDate",
  nascimento: "birthDate",
  salario: "salarioFixo",
  salariofixo: "salarioFixo",
  funcao: "cargo",
  cargo: "cargo",
  dataentrada: "admissionDate",
  dataadmissao: "admissionDate",
  dataentradanaempresa: "admissionDate",
  datadeentradanaempresa: "admissionDate",
  datadeadmissao: "admissionDate",
  admissao: "admissionDate",
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
  if (!s) return null;
  const br = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (br) return new Date(Date.UTC(Number(br[3]), Number(br[2]) - 1, Number(br[1])));
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (iso) return new Date(Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])));
  return null;
}

function parseSalario(raw: string): number | null {
  const cleaned = raw.replace(/[R$\s]/g, "").replace(/\./g, "").replace(",", ".");
  const n = Number(cleaned);
  return Number.isFinite(n) && cleaned !== "" ? n : null;
}

function onlyDigits(s: string): string {
  return s.replace(/\D/g, "");
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

  if (columnMap.name === undefined || columnMap.admissionDate === undefined) {
    return NextResponse.json(
      {
        error:
          'Cabeçalho inválido. Esperado ao menos "Nome" e "Data de entrada na empresa" (chave pix, CPF, celular, aniversário, salário e função são opcionais).',
      },
      { status: 400 }
    );
  }

  const existingEmployees = await prisma.employee.findMany({ where: { empresaId: empresa.id } });
  const byCpf = new Map(existingEmployees.filter((e) => e.cpf).map((e) => [onlyDigits(e.cpf!), e]));
  const byName = new Map(existingEmployees.map((e) => [e.name.trim().toLowerCase(), e]));

  const errors: string[] = [];
  let created = 0;
  let updated = 0;

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.every((c) => String(c).trim() === "")) continue;

    const get = (key: string) => (columnMap[key] !== undefined ? String(row[columnMap[key]] ?? "").trim() : "");

    const name = get("name");
    if (!name) {
      errors.push(`Linha ${i + 1}: nome não informado.`);
      continue;
    }

    const admissionRaw = columnMap.admissionDate !== undefined ? row[columnMap.admissionDate] : "";
    const admissionDate = parseDateFlexible(admissionRaw);
    if (!admissionDate) {
      errors.push(`Linha ${i + 1}: data de entrada inválida ("${admissionRaw}") para "${name}".`);
      continue;
    }

    const cpfRaw = get("cpf");
    const cpf = cpfRaw ? onlyDigits(cpfRaw) : "";
    const pixKey = get("pixKey") || null;
    const phone = get("phone") || null;
    const cargo = get("cargo") || "Geral";
    const birthRaw = get("birthDate");
    const birthDate = birthRaw ? parseDateFlexible(birthRaw) : null;
    const salarioRaw = get("salarioFixo");
    const salarioFixo = salarioRaw ? parseSalario(salarioRaw) : null;

    const existing = (cpf && byCpf.get(cpf)) || byName.get(name.toLowerCase());

    const data = {
      name,
      cargo,
      admissionDate,
      phone,
      cpf: cpf || null,
      pixKey,
      birthDate,
      salarioFixo,
    };

    if (existing) {
      // Não sobrescreve o setor no update — a planilha não traz essa coluna,
      // e o setor pode ter sido ajustado manualmente depois do cadastro.
      await prisma.employee.update({ where: { id: existing.id }, data });
      updated++;
    } else {
      // Setor não vem na planilha: usa a função como valor inicial (campo obrigatório).
      const employee = await prisma.employee.create({ data: { ...data, setor: cargo, empresaId: empresa.id } });
      const periodo = computeCurrentAquisitivePeriod(admissionDate);
      await prisma.vacation.create({
        data: {
          employeeId: employee.id,
          empresaId: empresa.id,
          periodoAquisitivoInicio: periodo.inicio,
          periodoAquisitivoFim: periodo.fim,
          diasDireito: periodo.diasDireito,
          status: "PLANEJADA",
          createdById: session.user.id,
        },
      });
      created++;
      if (cpf) byCpf.set(cpf, employee);
      byName.set(name.toLowerCase(), employee);
    }
  }

  return NextResponse.json({ imported: created + updated, created, updated, errors });
}
