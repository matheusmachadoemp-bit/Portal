import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";

const NEXT_STATUS_MOVEMENT = new Set(["ENVIADA", "RECEBIDA"]);

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = await req.json();

  const existing = await prisma.transfer.findUnique({
    where: { id },
    include: { items: { include: { ingredient: true } }, origemEmpresa: true, destinoEmpresa: true },
  });
  if (!existing) return NextResponse.json({ error: "Não encontrada." }, { status: 404 });

  const novoStatus = body.status as string | undefined;
  const disparaSaida = novoStatus === "ENVIADA" && existing.status !== "ENVIADA" && !NEXT_STATUS_MOVEMENT.has(existing.status);

  const ops = [];

  if (disparaSaida) {
    for (const item of existing.items) {
      ops.push(
        prisma.stockMovement.create({
          data: {
            ingredientId: item.ingredientId,
            empresaId: existing.origemEmpresaId,
            type: "TRANSFERENCIA",
            quantidade: item.quantidadeEnviada,
            estoqueApos: Math.max(0, item.ingredient.estoqueAtual - item.quantidadeEnviada),
            motivo: `Transferência enviada para ${existing.destinoEmpresa.name}`,
            origin: "TRANSFERENCIA_ENVIADA",
            destino: existing.destinoEmpresa.name,
            autorizadoPor: body.responsavelEnvio || session.user.name || null,
            createdById: session.user.id,
          },
        }),
        prisma.ingredient.update({
          where: { id: item.ingredientId },
          data: { estoqueAtual: Math.max(0, item.ingredient.estoqueAtual - item.quantidadeEnviada) },
        })
      );
    }
  }

  if (novoStatus === "RECEBIDA" && Array.isArray(body.quantidadesRecebidas)) {
    for (const q of body.quantidadesRecebidas as { itemId: string; quantidade: number }[]) {
      ops.push(prisma.transferItem.update({ where: { id: q.itemId }, data: { quantidadeRecebida: Number(q.quantidade) } }));
    }
  }

  ops.push(
    prisma.transfer.update({
      where: { id },
      data: {
        status: (novoStatus ?? undefined) as never,
        responsavelRecebimento: body.responsavelRecebimento ?? undefined,
        dataEnvio: novoStatus === "ENVIADA" ? new Date() : undefined,
        dataRecebimento: novoStatus === "RECEBIDA" ? new Date() : undefined,
        observacao: body.observacao !== undefined ? body.observacao || null : undefined,
      },
    })
  );

  const results = await prisma.$transaction(ops);
  const transfer = results[results.length - 1];

  return NextResponse.json({ transfer });
}
