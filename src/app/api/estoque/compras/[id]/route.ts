import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { assertEmpresaAccess } from "@/lib/empresa";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = await req.json();

  const existing = await prisma.purchase.findUnique({
    where: { id },
    include: { items: { include: { ingredient: true } }, receiving: true, supplier: true },
  });
  if (!existing) return NextResponse.json({ error: "Não encontrada." }, { status: 404 });
  if (!(await assertEmpresaAccess(session.user.id, session.user.role, existing.empresaId))) {
    return NextResponse.json({ error: "Sem acesso a essa loja." }, { status: 403 });
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
            estoqueAtual: item.ingredient.estoqueAtual + item.quantidade,
            precoAtual: item.valorUnitario,
            lastPurchaseDate: new Date(),
            ...(item.valorUnitario !== item.ingredient.precoAtual ? { priceHistory: { create: { price: item.valorUnitario } } } : {}),
          },
        })
      ),
    ]);
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
