import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { requireActiveSingleEmpresa } from "@/lib/empresa";
import * as XLSX from "xlsx";

// Colunas aceitas na planilha de importação de clientes (CRM > Clientes).
const HEADER_ALIASES: Record<string, string> = {
  nome: "nome",
  nomecompleto: "nome",
  cliente: "nome",
  telefone: "telefone",
  celular: "telefone",
  numerocelular: "telefone",
  whatsapp: "whatsapp",
  numerowhatsapp: "whatsapp",
  email: "email",
  emailcliente: "email",
  datanascimento: "dataNascimento",
  aniversario: "dataNascimento",
  nascimento: "dataNascimento",
  endereco: "endereco",
  enderecocompleto: "endereco",
  bairro: "bairro",
  cidade: "cidade",
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
  const isSpreadsheet = /\.xlsx?$/i.test(file.name);

  const rows = isSpreadsheet ? rowsFromWorkbook(buffer) : rowsFromCsvText(buffer.toString("utf-8"));

  if (rows.length < 2) {
    return NextResponse.json({ error: "Arquivo vazio ou sem linhas de dados." }, { status: 400 });
  }

  const headerRow = rows[0].map((h) => normalizeHeader(String(h)));
  const columnMap: Record<string, number> = {};
  headerRow.forEach((h, idx) => {
    const mapped = HEADER_ALIASES[h];
    if (mapped) columnMap[mapped] = idx;
  });

  if (columnMap.nome === undefined) {
    return NextResponse.json(
      {
        error:
          'Cabeçalho inválido. Esperado ao menos a coluna "Nome" (telefone, WhatsApp, e-mail, data de nascimento, endereço, bairro e cidade são opcionais).',
      },
      { status: 400 }
    );
  }

  const existingClientes = await prisma.cliente.findMany({ where: { empresaId: empresa.id } });
  const byTelefone = new Map(existingClientes.filter((c) => c.telefone).map((c) => [onlyDigits(c.telefone!), c]));

  const errors: string[] = [];
  let created = 0;
  let updated = 0;

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.every((c) => String(c).trim() === "")) continue;

    const get = (key: string) => (columnMap[key] !== undefined ? String(row[columnMap[key]] ?? "").trim() : "");

    const nome = get("nome");
    if (!nome) {
      errors.push(`Linha ${i + 1}: nome não informado.`);
      continue;
    }

    const telefoneRaw = get("telefone");
    const telefone = telefoneRaw ? onlyDigits(telefoneRaw) : "";
    const whatsapp = get("whatsapp") || null;
    const email = get("email") || null;
    const nascimentoRaw = get("dataNascimento");
    const dataNascimento = nascimentoRaw ? parseDateFlexible(nascimentoRaw) : null;
    const endereco = get("endereco") || null;
    const bairro = get("bairro") || null;
    const cidade = get("cidade") || null;

    const data = {
      nome,
      telefone: telefone || null,
      whatsapp,
      email,
      dataNascimento,
      endereco,
      bairro,
      cidade,
    };

    const existing = telefone ? byTelefone.get(telefone) : undefined;

    if (existing) {
      await prisma.cliente.update({ where: { id: existing.id }, data });
      updated++;
    } else {
      const cliente = await prisma.cliente.create({ data: { ...data, empresaId: empresa.id } });
      created++;
      if (telefone) byTelefone.set(telefone, cliente);
    }
  }

  return NextResponse.json({ imported: created + updated, created, updated, errors });
}
