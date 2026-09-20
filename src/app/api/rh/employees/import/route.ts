import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { requireActiveSingleEmpresa } from "@/lib/empresa";
import { computeCurrentAquisitivePeriod } from "@/lib/rh-helpers";
import { resolveEmployeeCargo, resolveEmployeeSetor } from "@/lib/rh-server";
import { hasModulePermission } from "@/lib/authz";
import { parseExcelDateCode, readWorkbookRows } from "@/lib/xlsx-import";

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
    const parsed = parseExcelDateCode(raw);
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

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // A planilha cria colaboradores novos e atualiza os já existentes (match por CPF/nome) na
  // mesma chamada — trata como canCreate por ser fundamentalmente uma importação em massa,
  // mesmo padrão usado em financeiro/conciliacao/import.
  if (!(await hasModulePermission(session.user.id, "rh", "canCreate"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite importar colaboradores." },
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

  // Cargo/Setor passam pelo catálogo de RH (EmployeeCargo/EmployeeSetor, ver @/lib/rh-server) —
  // mesmo mecanismo de "cadastra automaticamente quando o valor não bate com nenhuma opção já
  // cadastrada" já usado pela criação/edição manual de colaborador (POST/PATCH
  // /api/rh/employees), pra uma planilha com uma função nova não voltar a criar o mesmo tipo de
  // problema que originou esta tarefa (ver CLAUDE.md, "Importação de arquivos: não deixar valores
  // novos caírem em 'Outros'" — aqui o "Outros" seria o fallback "Geral" abaixo, que agora também
  // vira um item de catálogo normal na primeira vez que aparece, em vez de só texto solto).
  // Cacheado em memória por planilha (Map por texto já resolvido) — evita uma consulta/gravação
  // repetida no catálogo a cada linha quando várias linhas compartilham a mesma função.
  const cargoCache = new Map<string, string>();
  const setorCache = new Map<string, string>();
  async function resolveCargoCached(raw: string): Promise<{ ok: true; nome: string } | { ok: false; error: string }> {
    const cached = cargoCache.get(raw);
    if (cached) return { ok: true, nome: cached };
    const resultado = await resolveEmployeeCargo(empresa!.id, raw);
    if (!resultado.ok) return resultado;
    cargoCache.set(raw, resultado.nome);
    return { ok: true, nome: resultado.nome };
  }
  async function resolveSetorCached(raw: string): Promise<{ ok: true; nome: string } | { ok: false; error: string }> {
    const cached = setorCache.get(raw);
    if (cached) return { ok: true, nome: cached };
    const resultado = await resolveEmployeeSetor(empresa!.id, raw);
    if (!resultado.ok) return resultado;
    setorCache.set(raw, resultado.nome);
    return { ok: true, nome: resultado.nome };
  }

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
    const cargoRaw = get("cargo") || "Geral";
    const birthRaw = get("birthDate");
    const birthDate = birthRaw ? parseDateFlexible(birthRaw) : null;
    const salarioRaw = get("salarioFixo");
    const salarioFixo = salarioRaw ? parseSalario(salarioRaw) : null;

    const cargoResolvido = await resolveCargoCached(cargoRaw);
    if (!cargoResolvido.ok) {
      errors.push(`Linha ${i + 1}: ${cargoResolvido.error}`);
      continue;
    }
    const cargo = cargoResolvido.nome;

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
      // Setor não vem na planilha: usa a função como valor inicial (campo obrigatório) — mas
      // ainda passa pelo catálogo de setores (tabela separada da de cargos: o mesmo texto pode
      // já existir como cargo e precisar ser cadastrado pela primeira vez como setor, ou
      // vice-versa).
      const setorResolvido = await resolveSetorCached(cargo);
      if (!setorResolvido.ok) {
        errors.push(`Linha ${i + 1}: ${setorResolvido.error}`);
        continue;
      }
      const employee = await prisma.employee.create({ data: { ...data, setor: setorResolvido.nome, empresaId: empresa.id } });
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
