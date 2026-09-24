import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { assertEmpresaAccess } from "@/lib/empresa";
import { hasModulePermission } from "@/lib/authz";
import { logPurchaseEvent } from "@/lib/recebimento-server";
import { isValidBlobUrl } from "@/lib/manutencao-server";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = await req.json();

  if (body.notaFiscalUrl && !isValidBlobUrl(body.notaFiscalUrl)) {
    return NextResponse.json({ error: "URL de arquivo inválida." }, { status: 400 });
  }

  const existing = await prisma.purchase.findUnique({
    where: { id },
    include: { items: { include: { ingredient: true } }, receiving: true, supplier: true },
  });
  if (!existing) return NextResponse.json({ error: "Não encontrada." }, { status: 404 });
  if (!(await assertEmpresaAccess(session.user.id, session.user.role, existing.empresaId))) {
    return NextResponse.json({ error: "Sem acesso a essa loja." }, { status: 403 });
  }
  if (!(await hasModulePermission(session.user.id, "estoque", "canEdit"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite editar pedidos de compra." },
      { status: 403 }
    );
  }

  const willReceive = body.status === "RECEBIDO" && existing.status !== "RECEBIDO" && !existing.receiving;

  if (willReceive) {
    await prisma.$transaction([
      prisma.receiving.create({
        data: {
          purchaseId: existing.id,
          empresaId: existing.empresaId,
          responsavel: body.responsavel || session.user.name || null,
          status: "APROVADO",
          observacao: body.observacao || "Recebimento confirmado a partir da tela de Compras.",
        },
      }),
      ...existing.items.map((item) =>
        prisma.stockMovement.create({
          data: {
            ingredientId: item.ingredientId,
            empresaId: existing.empresaId,
            type: "ENTRADA",
            quantidade: item.quantidade,
            estoqueApos: item.ingredient.estoqueAtual + item.quantidade,
            motivo: `Compra NF ${existing.numeroNota ?? existing.id.slice(0, 8)} — ${existing.supplier.nomeFantasia ?? existing.supplier.razaoSocial}`,
            origin: "COMPRA",
            origem: existing.supplier.nomeFantasia ?? existing.supplier.razaoSocial,
            createdById: session.user.id,
          },
        })
      ),
      ...existing.items.map((item) =>
        prisma.ingredient.update({
          where: { id: item.ingredientId },
          data: {
            estoqueAtual: { increment: item.quantidade },
            precoAtual: item.valorUnitario,
            lastPurchaseDate: new Date(),
            ...(item.valorUnitario !== item.ingredient.precoAtual ? { priceHistory: { create: { price: item.valorUnitario } } } : {}),
          },
        })
      ),
      // Este fluxo ("Marcar recebido" na tela de Compras) não tem conferência item a item — é
      // "confirma tudo exatamente como foi pedido" (por isso o StockMovement acima já usa
      // `item.quantidade` direto, sem nenhum mapa de quantidades recebidas vindo do body). Por
      // isso, diferente de POST /api/estoque/recebimento e do link público de recebimento
      // (responder/[token]/finalizar), aqui `quantidadeRecebida` só pode ser a quantidade PEDIDA —
      // é o único dado disponível nesta tela. Sem isso, o relatório "Gasto por Insumo"
      // (computeGastoPorInsumoRows, src/lib/recebimento-server.ts) ficava com `quantidadeRecebida`
      // nula pra toda compra confirmada por este botão, caindo no fallback (mesmo valor, só que por
      // acidente em vez de por gravação explícita) — grava explícito aqui pra não depender do
      // fallback nesse caso, que é o normal (não uma exceção do histórico antigo).
      ...existing.items.map((item) =>
        prisma.purchaseItem.update({
          where: { id: item.id },
          data: { quantidadeRecebida: item.quantidade },
        })
      ),
    ]);

    await logPurchaseEvent({
      purchaseId: existing.id,
      empresaId: existing.empresaId,
      action: "Recebimento confirmado (tela de Compras)",
      userId: session.user.id,
    });
  }

  const purchase = await prisma.purchase.update({
    where: { id },
    data: {
      status: body.status ?? undefined,
      numeroNota: body.numeroNota !== undefined ? body.numeroNota || null : undefined,
      notaFiscalUrl: body.notaFiscalUrl !== undefined ? body.notaFiscalUrl || null : undefined,
      observacoes: body.observacoes !== undefined ? body.observacoes || null : undefined,
    },
    include: { items: { include: { ingredient: true } }, supplier: true, receiving: true },
  });

  return NextResponse.json({ purchase });
}
