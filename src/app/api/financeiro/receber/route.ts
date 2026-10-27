import { NextResponse } from "next/server";
import { parseDayInput } from "@/lib/timezone";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { balanceDelta } from "@/lib/finance";
import { empresaIdsForContext, getActiveEmpresaContext, requireActiveSingleEmpresa } from "@/lib/empresa";
import { hasModulePermission } from "@/lib/authz";

// Teto de segurança (mesmo espírito de `take: 300/2000` em `/api/estoque/compras` e `MAX_ROWS` em
// `/api/financeiro/conciliacao`): sem isso, qualquer chamada deste GET sem filtro de data devolvia
// o histórico inteiro da loja desde sempre — e era exatamente isso que `refresh()` em
// `contas-receber-client.tsx` fazia depois de QUALQUER ação (criar/editar/receber/excluir), trocando
// silenciosamente a janela de "últimos 120 dias" do carregamento inicial (ver
// `contas-a-receber/page.tsx`) por "tudo". A correção de raiz é `refresh()` reenviar a mesma janela
// de 120 dias (`from`, sem `to` — os mesmos limites do carregamento inicial, que só tem piso e não
// teto, para não esconder vencimentos futuros); os tetos abaixo são só uma rede de segurança
// adicional para quem chamar esta rota sem nenhum filtro de data.
const MAX_ROWS_WITH_DATE_FILTER = 5000;
const MAX_ROWS_WITHOUT_DATE_FILTER = 500;

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModulePermission(session.user.id, "financeiro", "canView"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite ver o Financeiro." },
      { status: 403 }
    );
  }

  const ctx = await getActiveEmpresaContext();
  if (!ctx) return NextResponse.json({ error: "Sem acesso a nenhuma loja." }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  // `to` é opcional: com só `from`, o filtro fica "a partir de" (mesmo comportamento do
  // carregamento inicial em `page.tsx`, que nunca tetou vencimentos futuros).
  const fromDate = from ? new Date(from) : null;
  const toDate = to ? new Date(to) : null;
  if ((from && (!fromDate || Number.isNaN(fromDate.getTime()))) || (to && (!toDate || Number.isNaN(toDate.getTime())))) {
    return NextResponse.json({ error: "Parâmetro de data inválido." }, { status: 400 });
  }

  // Sem filtro de data, o teto (MAX_ROWS_WITHOUT_DATE_FILTER) precisa pegar os lançamentos MAIS
  // RECENTES (não os mais antigos) — mesmo padrão de `/api/estoque/compras` (`orderBy: { data:
  // "desc" }` antes do `take`). Por isso buscamos em ordem decrescente e devolvemos de volta em
  // ordem crescente (reverse), para manter o mesmo contrato de ordenação (`asc`) que o ramo com
  // filtro de data já usa e que a tela espera para exibir a lista.
  const receivables = await prisma.receivable.findMany({
    where: {
      empresaId: { in: empresaIdsForContext(ctx) },
      ...(status ? { status: status as never } : {}),
      ...(fromDate ? { dataVencimento: { gte: fromDate, ...(toDate ? { lte: toDate } : {}) } } : {}),
    },
    orderBy: { dataVencimento: fromDate ? "asc" : "desc" },
    take: fromDate ? MAX_ROWS_WITH_DATE_FILTER : MAX_ROWS_WITHOUT_DATE_FILTER,
    include: {
      categoria: { select: { name: true } },
      createdBy: { select: { name: true } },
      empresa: { select: { name: true } },
    },
  });

  return NextResponse.json({ receivables: fromDate ? receivables : receivables.slice().reverse() });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModulePermission(session.user.id, "financeiro", "canCreate"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite criar lançamentos financeiros." },
      { status: 403 }
    );
  }

  const empresa = await requireActiveSingleEmpresa();
  if (!empresa) {
    return NextResponse.json(
      { error: "Selecione uma loja específica (não é possível cadastrar no modo Grupo Nord)." },
      { status: 400 }
    );
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Corpo da requisição inválido (esperado JSON)." }, { status: 400 });
  }
  if (!body.categoriaId || !body.dataCompetencia || !body.dataVencimento) {
    return NextResponse.json(
      { error: "Categoria, competência e vencimento são obrigatórios." },
      { status: 400 }
    );
  }
  // Dias gravados à meia-noite de São Paulo (03:00Z), como no resto do Portal. Ver `parseDayInput`.
  const dataCompetencia = parseDayInput(body.dataCompetencia);
  const dataVencimento = parseDayInput(body.dataVencimento);
  const dataRecebimento = body.dataRecebimento ? parseDayInput(body.dataRecebimento) : null;
  if (!dataCompetencia || !dataVencimento || (body.dataRecebimento && !dataRecebimento)) {
    return NextResponse.json({ error: "Data inválida. Use o formato AAAA-MM-DD." }, { status: 400 });
  }
  if (!body.cliente || !String(body.cliente).trim()) {
    return NextResponse.json({ error: "Cliente é obrigatório." }, { status: 400 });
  }
  if (!body.descricao || !String(body.descricao).trim()) {
    return NextResponse.json({ error: "Descrição é obrigatória." }, { status: 400 });
  }
  const valor = Number(body.valor);
  if (!body.valor || !Number.isFinite(valor) || valor <= 0) {
    return NextResponse.json({ error: "Valor é obrigatório e deve ser maior que zero." }, { status: 400 });
  }

  // FinancialCategory é cadastro global (sem empresaId), então basta existir — não há "pertencer
  // à loja" para checar aqui. Mesmo padrão usado em `/api/financeiro/pagar`.
  const categoria = await prisma.financialCategory.findUnique({ where: { id: body.categoriaId } });
  if (!categoria) {
    return NextResponse.json({ error: "Categoria financeira não encontrada." }, { status: 400 });
  }

  const status = body.status || "EM_ABERTO";

  const preDelta = balanceDelta(1, status, valor);
  if (preDelta && body.bankAccountId) {
    const bankAccount = await prisma.bankAccount.findUnique({ where: { id: body.bankAccountId } });
    if (!bankAccount || bankAccount.empresaId !== empresa.id) {
      return NextResponse.json({ error: "Conta bancária inválida para esta loja." }, { status: 400 });
    }
  }

  const receivable = await prisma.$transaction(async (tx) => {
    // number vem do id sequencial autoincrementado pelo Postgres (sequence),
    // não de COUNT(*): evita duas requisições simultâneas gerarem o mesmo
    // número (condição de corrida real com o COUNT(*) anterior).
    let created = await tx.receivable.create({
      data: {
        number: body.number || "",
        cliente: body.cliente,
        descricao: body.descricao,
        categoriaId: body.categoriaId,
        centroCusto: body.centroCusto || null,
        empresaId: empresa.id,
        valor,
        dataCompetencia,
        dataVencimento,
        dataRecebimento,
        bankAccountId: body.bankAccountId || null,
        formaRecebimento: body.formaRecebimento || null,
        parcelado: !!body.parcelado,
        quantidadeParcelas: body.quantidadeParcelas ? Number(body.quantidadeParcelas) : null,
        parcelaAtual: body.parcelaAtual ? Number(body.parcelaAtual) : null,
        observacoes: body.observacoes || null,
        status,
        createdById: session.user.id,
      },
    });

    if (!body.number) {
      created = await tx.receivable.update({
        where: { id: created.id },
        data: { number: `CR-${String(created.sequence).padStart(5, "0")}` },
      });
    }

    const delta = balanceDelta(1, status, valor);
    if (delta && created.bankAccountId) {
      await tx.bankAccount.update({
        where: { id: created.bankAccountId },
        data: { saldoAtual: { increment: delta } },
      });
    }

    return created;
  });

  await prisma.auditLog.create({
    data: {
      userId: session.user.id,
      empresaId: empresa.id,
      action: "CREATE",
      entityType: "Receivable",
      entityId: receivable.id,
      after: JSON.stringify(receivable),
    },
  });

  return NextResponse.json({ receivable });
}
