import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  checkRecebimentoRateLimit,
  loadPurchaseByToken,
  logPurchaseEvent,
  notifyReceivingCompleted,
  notifyReceivingDivergence,
  receivingState,
} from "@/lib/recebimento-server";
import { isValidBlobUrl } from "@/lib/manutencao-server";

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!(await checkRecebimentoRateLimit(req.headers, token))) {
    return NextResponse.json({ error: "Muitas tentativas, aguarde alguns minutos." }, { status: 429 });
  }
  const body = await req.json().catch(() => ({}));
  if (body.fotoNotaUrl && !isValidBlobUrl(body.fotoNotaUrl)) {
    return NextResponse.json({ error: "URL de arquivo inválida." }, { status: 400 });
  }
  const purchase = await loadPurchaseByToken(token);
  const state = receivingState(purchase);
  if (state === "invalido") return NextResponse.json({ error: "Link inválido." }, { status: 404 });
  if (state !== "ok" || !purchase!.receiving) {
    return NextResponse.json({ error: "Inicie o recebimento antes de finalizar." }, { status: 400 });
  }

  const pendentes = purchase!.items.filter((it) => it.receivingItem?.status === "NAO_CONFERIDO");
  if (pendentes.length > 0) {
    return NextResponse.json(
      { error: `Confira todos os produtos antes de finalizar (faltam ${pendentes.length}).` },
      { status: 400 }
    );
  }

  const houveDivergencia = purchase!.items.some(
    (it) => it.receivingItem?.status === "DIVERGENCIA" || it.receivingItem?.status === "NAO_RECEBIDO"
  );
  const responsavelId = purchase!.responsavelRecebimentoId;
  const responsavelNome = purchase!.responsavelRecebimento?.name ?? null;

  const movimentos = responsavelId
    ? purchase!.items.flatMap((it) => {
        const ri = it.receivingItem!;
        if (ri.status === "NAO_RECEBIDO" || ri.quantidadeRecebida == null || ri.quantidadeRecebida <= 0) return [];
        return [
          prisma.stockMovement.create({
            data: {
              ingredientId: it.ingredientId,
              empresaId: purchase!.empresaId,
              type: "ENTRADA",
              quantidade: ri.quantidadeRecebida,
              estoqueApos: it.ingredient.estoqueAtual + ri.quantidadeRecebida,
              motivo: `Recebimento — ${purchase!.supplier.nomeFantasia ?? purchase!.supplier.razaoSocial} (pedido ${purchase!.id.slice(-5).toUpperCase()})`,
              origin: "COMPRA",
              origem: purchase!.supplier.nomeFantasia ?? purchase!.supplier.razaoSocial,
              autorizadoPor: responsavelNome,
              createdById: responsavelId,
            },
          }),
          prisma.ingredient.update({
            where: { id: it.ingredientId },
            data: {
              estoqueAtual: { increment: ri.quantidadeRecebida },
              precoAtual: ri.precoInformado ?? it.valorUnitario,
              lastPurchaseDate: new Date(),
            },
          }),
        ];
      })
    : [];

  // Grava a quantidade que REALMENTE chegou (já conferida item a item nesta tela) no próprio
  // PurchaseItem — mesma finalidade do bloco análogo em POST /api/estoque/recebimento (tela
  // interna): sem isso, o relatório "Gasto por Insumo" (computeGastoPorInsumoRows, src/lib/
  // recebimento-server.ts) fica sem dado nenhum para todo recebimento concluído por este fluxo
  // (link público), que é justamente o mais detalhado dos dois (conferência item a item, com
  // preço da nota por item). NAO_RECEBIDO sempre vira 0, mesmo que `quantidadeRecebida` na
  // ReceivingItem ainda esteja com o valor padrão (a UI não zera esse campo ao marcar divergência
  // "produto não entregue" — só o status muda) — mesmo tratamento que `movimentos` acima já dá
  // pra decidir se cria StockMovement.
  const purchaseItemUpdates = responsavelId
    ? purchase!.items.map((it) => {
        const ri = it.receivingItem!;
        const quantidadeRecebida = ri.status === "NAO_RECEBIDO" ? 0 : (ri.quantidadeRecebida ?? it.quantidade);
        return prisma.purchaseItem.update({
          where: { id: it.id },
          data: { quantidadeRecebida },
        });
      })
    : [];

  const valorPedido = purchase!.items.reduce((s, it) => s + it.valorTotal, 0) + purchase!.frete - purchase!.desconto;
  const valorNotaInformado = body.valorNota != null && body.valorNota !== "" ? Number(body.valorNota) : null;

  await prisma.$transaction([
    prisma.receiving.update({
      where: { id: purchase!.receiving.id },
      data: {
        dataFim: new Date(),
        status: houveDivergencia ? "AGUARDANDO_SOLUCAO" : "APROVADO",
        divergencias: houveDivergencia
          ? [...new Set(purchase!.items.flatMap((it) => it.receivingItem?.divergenciaTipos?.split(",") ?? []))].join(",")
          : null,
        numeroNotaInformado: body.numeroNota || null,
        valorNotaInformado,
        fotoNotaUrl: body.fotoNotaUrl || null,
      },
    }),
    prisma.purchase.update({
      where: { id: purchase!.id },
      data: { status: houveDivergencia ? "DIVERGENCIA" : "RECEBIDO" },
    }),
    ...movimentos,
    ...purchaseItemUpdates,
  ]);

  await logPurchaseEvent({
    purchaseId: purchase!.id,
    empresaId: purchase!.empresaId,
    action: houveDivergencia ? "Recebimento finalizado com divergência" : "Recebimento finalizado",
    userId: purchase!.responsavelRecebimentoId,
  });

  if (houveDivergencia) {
    const divergenciasCount = purchase!.items.filter(
      (it) => it.receivingItem?.status === "DIVERGENCIA" || it.receivingItem?.status === "NAO_RECEBIDO"
    ).length;
    const valorRecebido = purchase!.items.reduce(
      (s, it) => s + (it.receivingItem?.quantidadeRecebida ?? 0) * (it.receivingItem?.precoInformado ?? it.valorUnitario),
      0
    );
    const impactoFinanceiro = (valorNotaInformado ?? valorRecebido) - valorPedido;
    await notifyReceivingDivergence(purchase!, {
      totalItens: purchase!.items.length,
      divergencias: divergenciasCount,
      impactoFinanceiro,
    });
    await logPurchaseEvent({
      purchaseId: purchase!.id,
      empresaId: purchase!.empresaId,
      action: "Gerente notificado sobre divergência",
      userId: purchase!.responsavelRecebimentoId,
    });
  } else {
    await notifyReceivingCompleted(purchase!, { totalItens: purchase!.items.length });
    await logPurchaseEvent({
      purchaseId: purchase!.id,
      empresaId: purchase!.empresaId,
      action: "Gerente notificado sobre recebimento concluído",
      userId: purchase!.responsavelRecebimentoId,
    });
  }

  return NextResponse.json({ ok: true, houveDivergencia, valorPedido, valorNotaInformado });
}
