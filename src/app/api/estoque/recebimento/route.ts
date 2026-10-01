import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { assertEmpresaAccess, empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";
import { hasModulePermission } from "@/lib/authz";
import {
  loadRecebimentoDashboard,
  logPurchaseEvent,
  notifyReceivingCompleted,
  notifyReceivingDivergence,
  resolveRecebimentoDashboardRange,
} from "@/lib/recebimento-server";
import { RECEIVING_DIVERGENCE_LABEL } from "@/lib/estoque";
import { isValidBlobUrl } from "@/lib/manutencao-server";
import type { RollingPeriodKey } from "@/lib/periods";

/**
 * Filtro de período do card "Dashboard gerencial" — mesmo padrão (`key`/`from`/`to` +
 * `resolveRollingPeriod`, já tratando fuso de São Paulo) de outras rotas do portal (ver CLAUDE.md).
 * `key` ausente NÃO significa "sem filtro nenhum": o dashboard sempre foi (e continua sendo) uma
 * janela fechada — sem `key`, a janela agora é "mês atual" (ver `resolveRecebimentoDashboardRange`,
 * src/lib/recebimento-server.ts, para o detalhe de por que o default mudou de "últimos 30 dias
 * corridos" pra "mês atual" — elimina o flash de KPI no primeiro carregamento da tela).
 * `pendentes`/`recebimentos` (as duas listas da tela) nunca tiveram filtro de data nenhum e
 * continuam sem — só o `dashboard`, que é novo nesta resposta, respeita `key`/`from`/`to`.
 */
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModulePermission(session.user.id, "estoque", "canView"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite ver o Estoque." },
      { status: 403 }
    );
  }

  const ctx = await getActiveEmpresaContext();
  if (!ctx) return NextResponse.json({ error: "Sem acesso a nenhuma loja." }, { status: 403 });
  const empresaIds = empresaIdsForContext(ctx);

  const { searchParams } = new URL(req.url);
  const key = searchParams.get("key") as RollingPeriodKey | null;
  const from = searchParams.get("from") ?? undefined;
  const to = searchParams.get("to") ?? undefined;
  const { since, until } = resolveRecebimentoDashboardRange(key, from, to);

  // `items` das duas listas abaixo (`pendentes`/`recebimentos`) usa `select` explícito, não
  // `include`, de propósito: `PurchaseItem` tem `valorUnitario`/`valorTotal` (o que foi pago por
  // aquele item) e um `include` solto devolveria essas 2 colunas pra qualquer usuário com
  // `estoque:canView` — inclusive um COLABORADOR com o Perfil de Permissão padrão "Funcionário",
  // já que esta rota (diferente de GET /api/estoque/compras) de propósito NÃO tem gate de cargo:
  // "Recebimento de Mercadorias" é a tela de conferência/entrada de mercadoria aberta a qualquer
  // colaborador operacional (ver RECEBIMENTO_MANAGE_ROLES em src/lib/estoque.ts e o comentário em
  // GET /api/estoque/compras sobre por que aquela outra tela SIM é restrita a cargos de gestão).
  // Nem `pendentes` (consumida por src/app/portal/estoque/recebimento/recebimento-client.tsx e,
  // só para contar status, por src/app/portal/estoque/compras/compras-client.tsx) nem
  // `recebimentos` usam `valorUnitario`/`valorTotal` do item hoje — confirmado lendo os dois
  // clients antes desta mudança — então removê-los do `select` não quebra nenhum consumidor
  // atual; o restante dos campos de `PurchaseItem` continua selecionado igual a antes (só o
  // `include` virou `select` explícito para não herdar colunas novas por engano no futuro).
  const purchaseItemSelect = {
    id: true,
    ingredientId: true,
    quantidade: true,
    unidade: true,
    quantidadeRecebida: true,
    ingredient: { select: { id: true, name: true, unidade: true } },
  } as const;

  const [pendentes, recebimentos, dashboard] = await Promise.all([
    prisma.purchase.findMany({
      where: { empresaId: { in: empresaIds }, status: { in: ["PEDIDO_REALIZADO", "AGUARDANDO_ENTREGA", "EM_CONFERENCIA", "RECEBIDO_PARCIAL"] } },
      orderBy: { data: "desc" },
      include: {
        supplier: { select: { id: true, razaoSocial: true, nomeFantasia: true } },
        items: { select: purchaseItemSelect },
        responsavelRecebimento: { select: { name: true } },
      },
    }),
    prisma.receiving.findMany({
      where: { empresaId: { in: empresaIds } },
      orderBy: { dataHora: "desc" },
      take: 200,
      include: {
        purchase: {
          include: {
            supplier: { select: { id: true, razaoSocial: true, nomeFantasia: true } },
            items: { select: purchaseItemSelect },
          },
        },
      },
    }),
    loadRecebimentoDashboard(empresaIds, since, until),
  ]);

  return NextResponse.json({ pendentes, recebimentos, dashboard });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  if (!body.purchaseId) return NextResponse.json({ error: "Informe o pedido de compra." }, { status: 400 });
  if (body.fotoMercadoriaUrl && !isValidBlobUrl(body.fotoMercadoriaUrl)) {
    return NextResponse.json({ error: "URL de arquivo inválida." }, { status: 400 });
  }
  if (body.fotoNotaUrl && !isValidBlobUrl(body.fotoNotaUrl)) {
    return NextResponse.json({ error: "URL de arquivo inválida." }, { status: 400 });
  }

  const purchase = await prisma.purchase.findUnique({
    where: { id: body.purchaseId },
    include: { items: { include: { ingredient: true } }, supplier: true, receiving: true },
  });
  if (!purchase) return NextResponse.json({ error: "Pedido de compra não encontrado." }, { status: 404 });
  if (!(await assertEmpresaAccess(session.user.id, session.user.role, purchase.empresaId))) {
    return NextResponse.json({ error: "Sem acesso a essa loja." }, { status: 403 });
  }
  // Este POST sempre cria um Receiving novo para o pedido (a linha acima já barra o caso de já
  // existir um) — nunca atualiza um recebimento existente (isso é feito na tela de divergências).
  if (!(await hasModulePermission(session.user.id, "estoque", "canCreate"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite registrar recebimentos." },
      { status: 403 }
    );
  }
  if (purchase.receiving) return NextResponse.json({ error: "Este pedido já possui um recebimento registrado." }, { status: 400 });

  const status = body.status || "APROVADO";
  const houveDivergencia = ["APROVADO_RESSALVA", "RECEBIDO_PARCIAL", "RECUSADO", "AGUARDANDO_SOLUCAO"].includes(status);
  const gerarMovimentos = status === "APROVADO" || status === "APROVADO_RESSALVA" || status === "RECEBIDO_PARCIAL";

  const [receiving] = await prisma.$transaction([
    prisma.receiving.create({
      data: {
        purchaseId: purchase.id,
        empresaId: purchase.empresaId,
        responsavel: body.responsavel || session.user.name || null,
        status,
        // Diferente do fluxo do link público (responder/[token]/route.ts cria com dataInicio e só
        // responder/[token]/finalizar/route.ts grava dataFim depois, quando o responsável termina a
        // conferência item a item), este POST é síncrono: o funcionário preenche o formulário
        // inteiro na tela e envia tudo de uma vez, sem fase "em andamento" intermediária — o
        // recebimento já nasce concluído. Sem gravar dataFim aqui, o Receiving nunca aparecia nos
        // KPIs do dashboard gerencial (loadRecebimentoDashboard, src/lib/recebimento-server.ts, que
        // filtra tudo por dataFim), mesmo já concluído e listado no histórico da tela.
        dataFim: new Date(),
        divergencias: Array.isArray(body.divergencias) ? body.divergencias.join(",") : null,
        detalhes: body.detalhes ? JSON.stringify(body.detalhes) : null,
        fotoMercadoriaUrl: body.fotoMercadoriaUrl || null,
        fotoNotaUrl: body.fotoNotaUrl || null,
        observacao: body.observacao || null,
      },
    }),
    prisma.purchase.update({
      where: { id: purchase.id },
      data: { status: status === "RECUSADO" ? "DIVERGENCIA" : status === "RECEBIDO_PARCIAL" ? "RECEBIDO_PARCIAL" : "RECEBIDO" },
    }),
    ...(gerarMovimentos
      ? purchase.items.flatMap((item) => {
          const quantidadeRecebida = body.quantidadesRecebidas?.[item.id] !== undefined ? Number(body.quantidadesRecebidas[item.id]) : item.quantidade;
          return [
            prisma.stockMovement.create({
              data: {
                ingredientId: item.ingredientId,
                empresaId: purchase.empresaId,
                type: "ENTRADA",
                quantidade: quantidadeRecebida,
                estoqueApos: item.ingredient.estoqueAtual + quantidadeRecebida,
                motivo: `Recebimento NF ${purchase.numeroNota ?? purchase.id.slice(0, 8)} — ${purchase.supplier.nomeFantasia ?? purchase.supplier.razaoSocial}`,
                origin: "COMPRA",
                origem: purchase.supplier.nomeFantasia ?? purchase.supplier.razaoSocial,
                autorizadoPor: body.responsavel || session.user.name || null,
                createdById: session.user.id,
              },
            }),
            prisma.ingredient.update({
              where: { id: item.ingredientId },
              data: { estoqueAtual: { increment: quantidadeRecebida }, precoAtual: item.valorUnitario, lastPurchaseDate: new Date() },
            }),
            // Grava a quantidade que REALMENTE chegou no próprio PurchaseItem — sem isso, o
            // relatório "Gasto por Insumo" (computeGastoPorInsumoRows, src/lib/recebimento-server.ts)
            // não tem como saber depois quanto foi recebido de fato num recebimento parcial (só
            // teria a quantidade PEDIDA). Mesmo valor já usado acima pro StockMovement.
            prisma.purchaseItem.update({
              where: { id: item.id },
              data: { quantidadeRecebida },
            }),
          ];
        })
      : []),
  ]);

  await logPurchaseEvent({
    purchaseId: purchase.id,
    empresaId: purchase.empresaId,
    action: houveDivergencia ? "Recebimento finalizado com divergência" : "Recebimento finalizado",
    userId: session.user.id,
  });

  // Notifica gerente(s) da loja + quem criou o pedido do resultado do recebimento — mesmo
  // aviso que já existia (mas só era disparado) no fluxo do link público de recebimento.
  if (houveDivergencia) {
    const tipos = Array.isArray(body.divergencias)
      ? body.divergencias.map((key: string) => RECEIVING_DIVERGENCE_LABEL[key] ?? key)
      : [];
    await notifyReceivingDivergence(purchase, {
      totalItens: purchase.items.length,
      divergencias: null,
      impactoFinanceiro: null,
      tipos,
    });
    await logPurchaseEvent({
      purchaseId: purchase.id,
      empresaId: purchase.empresaId,
      action: "Gerente notificado sobre divergência",
      userId: session.user.id,
    });
  } else {
    await notifyReceivingCompleted(purchase, { totalItens: purchase.items.length });
    await logPurchaseEvent({
      purchaseId: purchase.id,
      empresaId: purchase.empresaId,
      action: "Gerente notificado sobre recebimento concluído",
      userId: session.user.id,
    });
  }

  return NextResponse.json({ receiving, houveDivergencia });
}
