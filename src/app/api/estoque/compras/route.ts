import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import {
  empresaIdsForContext,
  findUsersWithoutEmpresaAccess,
  getActiveEmpresaContext,
  requireActiveSingleEmpresa,
} from "@/lib/empresa";
import { logPurchaseEvent } from "@/lib/recebimento-server";
import { RECEBIMENTO_MANAGE_ROLES } from "@/lib/estoque";
import { hasModulePermission } from "@/lib/authz";
import { resolveRollingPeriod, type RollingPeriodKey } from "@/lib/periods";

/**
 * Filtro de período opcional: mesmo padrão (`key`/`from`/`to` + `resolveRollingPeriod`,
 * já tratando fuso de São Paulo) de src/app/api/vendas/faturamento/route.ts,
 * src/app/api/marketing/redes-sociais/route.ts e src/app/api/marketing/partners/route.ts.
 * Diferente daquelas rotas, aqui `key` é OPCIONAL e sem default: sem `key` (nenhum
 * parâmetro na query, como o `refresh()` de compras-client.tsx chama hoje) o
 * comportamento não muda em nada — todas as compras recentes, `take: 300`, sem
 * filtro de data — para não quebrar a tela atual antes do Caio ligar o
 * <PeriodFilterBar> a esses parâmetros numa fase seguinte.
 *
 * Com `key` presente, o `take` fixo de 300 deixa de valer: os KPIs da tela (Valor
 * total, Compras no filtro) são somados no client sobre a lista retornada, então
 * truncar em 300 dentro de um período efetivamente ativo sub-contaria o total
 * silenciosamente. `empresaId+data` já tem índice composto (`@@index([empresaId,
 * data])` em Purchase, schema.prisma) que cobre esse range scan, então não
 * precisou de migration nova. Ainda assim mantemos um teto alto (2000) em vez de
 * remover o limite por completo — só como rede de segurança contra um período
 * "Personalizado" muito largo demais; se algum dia isso passar a ser atingido de
 * verdade, o próximo passo é paginação de verdade (o mesmo padrão `page`/`pageSize`
 * já usado em src/app/api/satisfacao-cliente/avaliacoes/route.ts), não um teto
 * ainda maior.
 */
// Checagem de cargo (RECEBIMENTO_MANAGE_ROLES, o mesmo já usado no POST abaixo) — sem ela,
// qualquer COLABORADOR com o Perfil de Permissão padrão "Funcionário" (estoque:canView=true de
// fábrica) conseguia ver o valor pago em cada item de cada pedido de compra (achado ALTO do
// Jonas, auditoria de 2026-10-01). Bloqueio da tela inteira (não só do campo de preço): o preço
// está presente em TODA linha da listagem ("Valor total", coluna sempre visível, não um detalhe
// opcional) e no card "Valor total" do topo, então ocultar só `valorUnitario` quebraria a tabela
// visualmente. Quem só precisa conferir/dar entrada numa mercadoria (uso operacional legítimo) já
// tem uma tela própria pra isso — Estoque > Recebimento de Mercadorias
// (src/app/portal/estoque/recebimento/page.tsx, mesmo card "Aguardando entrega" que existe aqui),
// que continua liberada pra qualquer COLABORADOR com estoque:canView e cuja UI não exibe preço
// por item hoje (só o agregado "Valor em divergências" do dashboard gerencial). Atenção: a rota
// GET /api/estoque/recebimento por trás dessa tela NÃO filtra `valorUnitario`/`valorTotal` do
// JSON (só o `select` do insumo embutido exclui `precoAtual` — os campos de preço do próprio
// PurchaseItem passam direto) — ela não é uma das 4 telas deste achado e não foi alterada aqui,
// mas é uma lacuna correlata que vale auditar à parte (reportada no relatório desta tarefa).
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModulePermission(session.user.id, "estoque", "canView"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite ver o Estoque." },
      { status: 403 }
    );
  }
  if (!RECEBIMENTO_MANAGE_ROLES.includes(session.user.role)) {
    return NextResponse.json(
      { error: "Compras é restrito a Administrador, Gestor, Gerente ou Supervisor. Para conferir mercadoria recebida, use Estoque > Recebimento de Mercadorias." },
      { status: 403 }
    );
  }

  const ctx = await getActiveEmpresaContext();
  if (!ctx) return NextResponse.json({ error: "Sem acesso a nenhuma loja." }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const key = searchParams.get("key") as RollingPeriodKey | null;
  const from = searchParams.get("from") ?? undefined;
  const to = searchParams.get("to") ?? undefined;
  const dateFilter = key ? resolveRollingPeriod(key, { from, to }) : null;

  const purchases = await prisma.purchase.findMany({
    where: {
      empresaId: { in: empresaIdsForContext(ctx) },
      ...(dateFilter ? { data: { gte: dateFilter.from, lte: dateFilter.to } } : {}),
    },
    orderBy: { data: "desc" },
    take: dateFilter ? 2000 : 300,
    include: {
      supplier: { select: { id: true, razaoSocial: true, nomeFantasia: true } },
      items: { include: { ingredient: { select: { id: true, name: true, unidade: true, precoAtual: true, quantidadeEmbalagem: true } } } },
      receiving: { select: { id: true, status: true } },
      createdBy: { select: { name: true } },
    },
  });
  return NextResponse.json({ purchases });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!RECEBIMENTO_MANAGE_ROLES.includes(session.user.role)) {
    return NextResponse.json({ error: "Você não tem permissão para registrar pedidos de compra." }, { status: 403 });
  }
  if (!(await hasModulePermission(session.user.id, "estoque", "canCreate"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite registrar pedidos de compra." },
      { status: 403 }
    );
  }

  const empresa = await requireActiveSingleEmpresa();
  if (!empresa) {
    return NextResponse.json({ error: "Selecione uma loja específica para registrar uma compra." }, { status: 400 });
  }

  const body = await req.json();
  if (!body.supplierId || !Array.isArray(body.itens) || body.itens.length === 0) {
    return NextResponse.json({ error: "Informe o fornecedor e ao menos um item." }, { status: 400 });
  }

  if (body.enviarParaRecebimento && !body.responsavelRecebimentoId) {
    return NextResponse.json({ error: "Selecione o responsável pelo recebimento antes de enviar." }, { status: 400 });
  }

  // O responsável pelo recebimento precisa ter acesso a esta loja — sem essa checagem,
  // qualquer usuário ativo da empresa toda podia ser designado responsável por um recebimento
  // de uma loja à qual não tem acesso nenhum.
  if (body.responsavelRecebimentoId) {
    const invalidIds = await findUsersWithoutEmpresaAccess([body.responsavelRecebimentoId], empresa.id);
    if (invalidIds.length > 0) {
      return NextResponse.json({ error: "Esse responsável não tem acesso a esta loja." }, { status: 400 });
    }
  }

  // O fornecedor precisa pertencer a esta mesma loja — sem essa checagem, um
  // pedido de compra da loja ativa podia referenciar um fornecedor de outra
  // loja, contaminando as estatísticas agregadas desse fornecedor (histórico
  // de recebimento, divergências etc. em GET .../fornecedores/[id]/historico-recebimento).
  const supplier = await prisma.supplier.findUnique({
    where: { id: body.supplierId },
    select: { empresaId: true },
  });
  if (!supplier) {
    return NextResponse.json({ error: "Fornecedor não encontrado." }, { status: 400 });
  }
  if (supplier.empresaId !== empresa.id) {
    return NextResponse.json({ error: "Esse fornecedor não pertence a esta loja." }, { status: 400 });
  }

  const purchase = await prisma.purchase.create({
    data: {
      empresaId: empresa.id,
      supplierId: body.supplierId,
      numeroNota: body.numeroNota || null,
      data: body.data ? new Date(body.data) : new Date(),
      previsaoEntrega: body.previsaoEntrega ? new Date(body.previsaoEntrega) : null,
      responsavelRecebimentoId: body.responsavelRecebimentoId || null,
      recebimentoToken: body.enviarParaRecebimento ? randomBytes(16).toString("hex") : null,
      compradorResponsavel: body.compradorResponsavel || session.user.name || null,
      formaPagamento: body.formaPagamento || null,
      dataVencimento: body.dataVencimento ? new Date(body.dataVencimento) : null,
      desconto: Number(body.desconto) || 0,
      frete: Number(body.frete) || 0,
      status: body.status || (body.enviarParaRecebimento ? "AGUARDANDO_ENTREGA" : "PEDIDO_REALIZADO"),
      observacoes: body.observacoes || null,
      createdById: session.user.id,
      items: {
        create: body.itens.map((it: { ingredientId: string; quantidade: number; unidade: string; valorUnitario: number }) => ({
          ingredientId: it.ingredientId,
          quantidade: Number(it.quantidade) || 0,
          unidade: it.unidade,
          valorUnitario: Number(it.valorUnitario) || 0,
          valorTotal: (Number(it.quantidade) || 0) * (Number(it.valorUnitario) || 0),
        })),
      },
    },
    include: { items: true, supplier: true },
  });

  await logPurchaseEvent({
    purchaseId: purchase.id,
    empresaId: empresa.id,
    action: `Pedido criado por ${session.user.name ?? "usuário"}`,
    userId: session.user.id,
  });
  if (body.enviarParaRecebimento) {
    await logPurchaseEvent({
      purchaseId: purchase.id,
      empresaId: empresa.id,
      action: "Pedido enviado para recebimento",
      userId: session.user.id,
    });
  }

  return NextResponse.json({ purchase });
}
