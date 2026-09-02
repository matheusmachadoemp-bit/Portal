import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { requireActiveSingleEmpresa } from "@/lib/empresa";
import * as XLSX from "xlsx";

// Vercel mata a função em 10s por padrão — um arquivo com centenas/milhares
// de linhas processadas uma a uma facilmente estoura isso. Com as operações
// em lote abaixo não deveria mais precisar de tanto tempo, mas isso dá
// margem de segurança.
export const maxDuration = 60;

// Colunas aceitas na planilha de importação de clientes (CRM > Clientes).
// Cobre tanto uma planilha "uma linha por pedido" (número do pedido, o que
// pediu, valor gasto daquele pedido) quanto uma exportação "uma linha por
// cliente" de outro sistema, com totais agregados (Qtd. Pedidos, Valor
// Total, Última Compra) — os dois formatos não costumam vir juntos.
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
  dataaniversario: "dataNascimento",
  aniversario: "dataNascimento",
  nascimento: "dataNascimento",
  endereco: "endereco",
  enderecocompleto: "endereco",
  bairro: "bairro",
  cidade: "cidade",
  // planilha "uma linha por pedido"
  numerodopedido: "numeroPedido",
  numeropedido: "numeroPedido",
  pedido: "numeroPedido",
  oquepediu: "itens",
  itenspedidos: "itens",
  itens: "itens",
  pedidorealizado: "itens",
  valorgasto: "valorPedido",
  // planilha "uma linha por cliente", com totais agregados
  qtdpedidos: "pedidosImportados",
  quantidadedepedidos: "pedidosImportados",
  valortotal: "valorGastoImportado",
  ticketmedio: "ticketMedioImportado",
  ultimacompra: "ultimaCompraImportada",
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

function parseValor(raw: string): number | null {
  const cleaned = raw.replace(/[R$\s]/g, "").replace(/\./g, "").replace(",", ".");
  const n = Number(cleaned);
  return Number.isFinite(n) && cleaned !== "" ? n : null;
}

function parseInteiro(raw: string): number | null {
  const n = parseInt(raw.replace(/\D/g, ""), 10);
  return Number.isFinite(n) ? n : null;
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

// Processa uma lista de promises em lotes concorrentes, em vez de uma a uma
// (lento demais para arquivos grandes) ou todas de uma vez (satura o pool
// de conexões do banco).
async function processInChunks<T>(items: T[], concurrency: number, task: (item: T) => Promise<void>) {
  for (let i = 0; i < items.length; i += concurrency) {
    await Promise.all(items.slice(i, i + concurrency).map(task));
  }
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
          'Cabeçalho inválido. Esperado ao menos a coluna "Nome" (as demais colunas de cliente e de pedidos são opcionais).',
      },
      { status: 400 }
    );
  }

  type ParsedRow = {
    line: number;
    nome: string;
    telefone: string;
    whatsapp: string | null;
    email: string | null;
    dataNascimento: Date | null;
    endereco: string | null;
    bairro: string | null;
    cidade: string | null;
    numeroPedido: string | null;
    itens: string | null;
    valorPedido: number | null;
    pedidosImportados: number | null;
    valorGastoImportado: number | null;
    ticketMedioImportado: number | null;
    ultimaCompraImportada: Date | null;
  };

  const errors: string[] = [];
  const parsed: ParsedRow[] = [];

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
    const nascimentoRaw = get("dataNascimento");
    const valorPedidoRaw = get("valorPedido");
    const pedidosImportadosRaw = get("pedidosImportados");
    const valorGastoImportadoRaw = get("valorGastoImportado");
    const ticketMedioImportadoRaw = get("ticketMedioImportado");
    const ultimaCompraRaw = get("ultimaCompraImportada");

    parsed.push({
      line: i + 1,
      nome,
      telefone: telefoneRaw ? onlyDigits(telefoneRaw) : "",
      whatsapp: get("whatsapp") || null,
      email: get("email") || null,
      dataNascimento: nascimentoRaw ? parseDateFlexible(nascimentoRaw) : null,
      endereco: get("endereco") || null,
      bairro: get("bairro") || null,
      cidade: get("cidade") || null,
      numeroPedido: get("numeroPedido") || null,
      itens: get("itens") || null,
      valorPedido: valorPedidoRaw ? parseValor(valorPedidoRaw) : null,
      pedidosImportados: pedidosImportadosRaw ? parseInteiro(pedidosImportadosRaw) : null,
      valorGastoImportado: valorGastoImportadoRaw ? parseValor(valorGastoImportadoRaw) : null,
      ticketMedioImportado: ticketMedioImportadoRaw ? parseValor(ticketMedioImportadoRaw) : null,
      ultimaCompraImportada: ultimaCompraRaw ? parseDateFlexible(ultimaCompraRaw) : null,
    });
  }

  const existingClientes = await prisma.cliente.findMany({ where: { empresaId: empresa.id } });
  const byTelefone = new Map(existingClientes.filter((c) => c.telefone).map((c) => [onlyDigits(c.telefone!), c]));

  const toCreate = parsed.filter((r) => !(r.telefone && byTelefone.has(r.telefone)));
  const toUpdate = parsed.filter((r) => r.telefone && byTelefone.has(r.telefone));

  // Cria todos os clientes novos de uma vez (uma linha sem telefone sempre
  // cria; com telefone repetido dentro do próprio arquivo, skipDuplicates
  // evita erro — só a primeira ocorrência entra).
  if (toCreate.length > 0) {
    await prisma.cliente.createMany({
      data: toCreate.map((r) => ({
        empresaId: empresa.id,
        nome: r.nome,
        telefone: r.telefone || null,
        whatsapp: r.whatsapp,
        email: r.email,
        dataNascimento: r.dataNascimento,
        endereco: r.endereco,
        bairro: r.bairro,
        cidade: r.cidade,
        pedidosImportados: r.pedidosImportados,
        valorGastoImportado: r.valorGastoImportado,
        ticketMedioImportado: r.ticketMedioImportado,
        ultimaCompraImportada: r.ultimaCompraImportada,
      })),
      skipDuplicates: true,
    });
  }

  // Recarrega para ter o id de todo mundo (inclusive os recém-criados),
  // já que createMany não retorna os registros criados.
  const allClientes = await prisma.cliente.findMany({ where: { empresaId: empresa.id } });
  const clienteIdByTelefone = new Map(allClientes.filter((c) => c.telefone).map((c) => [onlyDigits(c.telefone!), c.id]));

  let updated = 0;
  await processInChunks(toUpdate, 15, async (r) => {
    const clienteId = clienteIdByTelefone.get(r.telefone);
    if (!clienteId) return;
    await prisma.cliente.update({
      where: { id: clienteId },
      data: {
        nome: r.nome,
        whatsapp: r.whatsapp,
        email: r.email,
        dataNascimento: r.dataNascimento,
        endereco: r.endereco,
        bairro: r.bairro,
        cidade: r.cidade,
        pedidosImportados: r.pedidosImportados,
        valorGastoImportado: r.valorGastoImportado,
        ticketMedioImportado: r.ticketMedioImportado,
        ultimaCompraImportada: r.ultimaCompraImportada,
      },
    });
    updated++;
  });

  // Linhas com colunas de pedido individual (número do pedido / itens /
  // valor daquele pedido) viram histórico por pedido; não tenta cruzar com
  // linhas que só trazem totais agregados (tratadas acima, direto no
  // cliente).
  const comPedido = parsed.filter((r) => r.numeroPedido || r.itens || r.valorPedido !== null);
  await processInChunks(comPedido, 15, async (r) => {
    const clienteId = r.telefone ? clienteIdByTelefone.get(r.telefone) : undefined;
    if (!clienteId) return;
    if (r.numeroPedido) {
      await prisma.clienteHistoricoImportado.upsert({
        where: { clienteId_numeroPedido: { clienteId, numeroPedido: r.numeroPedido } },
        update: { itens: r.itens, valorGasto: r.valorPedido },
        create: { clienteId, empresaId: empresa.id, numeroPedido: r.numeroPedido, itens: r.itens, valorGasto: r.valorPedido },
      });
    } else {
      await prisma.clienteHistoricoImportado.create({
        data: { clienteId, empresaId: empresa.id, numeroPedido: null, itens: r.itens, valorGasto: r.valorPedido },
      });
    }
  });

  const created = toCreate.length;
  return NextResponse.json({ imported: created + updated, created, updated, errors });
}
