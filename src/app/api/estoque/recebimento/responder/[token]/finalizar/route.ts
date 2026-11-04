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
import { ESTOQUE_TX_OPTIONS } from "@/lib/estoque";

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
  // Capturado numa variável antes da transação: dentro do callback `async (tx) => {...}` abaixo,
  // o TypeScript não consegue mais garantir que `purchase!.receiving` continua não-nulo (a
  // checagem de `null` na linha 25 só vale no escopo síncrono de então, não atravessa o limite de
  // uma nova função) — mesmo o valor em si (o `id`) sendo lido antes de qualquer coisa mudar.
  const receivingId = purchase!.receiving.id;

  const valorPedido = purchase!.items.reduce((s, it) => s + it.valorTotal, 0) + purchase!.frete - purchase!.desconto;
  const valorNotaInformado = body.valorNota != null && body.valorNota !== "" ? Number(body.valorNota) : null;

  // Transação interativa (não em lote): mesma correção de POST /api/estoque/compras/[id] e
  // POST /api/estoque/recebimento — o saldo real (`Ingredient.estoqueAtual`) já era gravado com
  // `increment` atômico, mas `StockMovement.estoqueApos` era calculado a partir de
  // `it.ingredient.estoqueAtual` lido ANTES da transação, deixando o extrato de auditoria
  // incoerente sob concorrência (achado de auditoria, 2026-11). Processa cada item em sequência
  // dentro da MESMA transação, usando o `estoqueAtual` que o próprio `update` com `increment`
  // devolve para gravar o `StockMovement`.
  await prisma.$transaction(async (tx) => {
    await tx.receiving.update({
      where: { id: receivingId },
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
    });

    await tx.purchase.update({
      where: { id: purchase!.id },
      data: { status: houveDivergencia ? "DIVERGENCIA" : "RECEBIDO" },
    });

    if (responsavelId) {
      for (const it of purchase!.items) {
        const ri = it.receivingItem!;

        if (!(ri.status === "NAO_RECEBIDO" || ri.quantidadeRecebida == null || ri.quantidadeRecebida <= 0)) {
          const updatedIngredient = await tx.ingredient.update({
            where: { id: it.ingredientId },
            data: {
              estoqueAtual: { increment: ri.quantidadeRecebida },
              precoAtual: ri.precoInformado ?? it.valorUnitario,
              lastPurchaseDate: new Date(),
            },
          });

          await tx.stockMovement.create({
            data: {
              ingredientId: it.ingredientId,
              empresaId: purchase!.empresaId,
              type: "ENTRADA",
              quantidade: ri.quantidadeRecebida,
              estoqueApos: updatedIngredient.estoqueAtual,
              motivo: `Recebimento — ${purchase!.supplier.nomeFantasia ?? purchase!.supplier.razaoSocial} (pedido ${purchase!.id.slice(-5).toUpperCase()})`,
              origin: "COMPRA",
              origem: purchase!.supplier.nomeFantasia ?? purchase!.supplier.razaoSocial,
              autorizadoPor: responsavelNome,
              createdById: responsavelId,
            },
          });
        }

        // Grava a quantidade que REALMENTE chegou (já conferida item a item nesta tela) no
        // próprio PurchaseItem — mesma finalidade do bloco análogo em POST /api/estoque/
        // recebimento (tela interna): sem isso, o relatório "Gasto por Insumo"
        // (computeGastoPorInsumoRows, src/lib/recebimento-server.ts) fica sem dado nenhum para
        // todo recebimento concluído por este fluxo (link público), que é justamente o mais
        // detalhado dos dois (conferência item a item, com preço da nota por item).
        // NAO_RECEBIDO sempre vira 0, mesmo que `quantidadeRecebida` na ReceivingItem ainda
        // esteja com o valor padrão (a UI não zera esse campo ao marcar divergência "produto não
        // entregue" — só o status muda) — mesmo tratamento usado acima pra decidir se cria
        // StockMovement.
        const quantidadeRecebida = ri.status === "NAO_RECEBIDO" ? 0 : (ri.quantidadeRecebida ?? it.quantidade);
        await tx.purchaseItem.update({
          where: { id: it.id },
          data: { quantidadeRecebida },
        });
      }
    }
  }, ESTOQUE_TX_OPTIONS);

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
