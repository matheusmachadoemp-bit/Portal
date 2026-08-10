import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { empresaIdsForContext, getActiveEmpresaContext, requireActiveSingleEmpresa } from "@/lib/empresa";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ctx = await getActiveEmpresaContext();
  if (!ctx) return NextResponse.json({ error: "Sem acesso a nenhuma loja." }, { status: 403 });

  const movements = await prisma.cashMovement.findMany({
    where: { empresaId: { in: empresaIdsForContext(ctx) } },
    orderBy: { date: "desc" },
    take: 200,
    include: {
      bankAccount: { select: { name: true } },
      destino: { select: { name: true } },
      createdBy: { select: { name: true } },
    },
  });
  return NextResponse.json({ movements });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const empresa = await requireActiveSingleEmpresa();
  if (!empresa) {
    return NextResponse.json(
      { error: "Selecione uma loja específica (não é possível lançar no modo Grupo Nord)." },
      { status: 400 }
    );
  }

  const body = await req.json();

  const valor = Number(body.valor) || 0;
  const type = body.type as
    | "ENTRADA"
    | "SAIDA"
    | "TRANSFERENCIA"
    | "APORTE_SOCIO"
    | "RETIRADA_SOCIO";

  if (!body.bankAccountId || !valor) {
    return NextResponse.json({ error: "Conta e valor são obrigatórios." }, { status: 400 });
  }
  if (type === "TRANSFERENCIA" && !body.destinoId) {
    return NextResponse.json(
      { error: "Transferência exige uma conta de destino." },
      { status: 400 }
    );
  }

  const movement = await prisma.$transaction(async (tx) => {
    const created = await tx.cashMovement.create({
      data: {
        type,
        bankAccountId: body.bankAccountId,
        destinoId: body.destinoId || null,
        valor,
        descricao: body.descricao || null,
        empresaId: empresa.id,
        date: body.date ? new Date(body.date) : new Date(),
        createdById: session.user.id,
      },
    });

    if (type === "ENTRADA" || type === "APORTE_SOCIO") {
      await tx.bankAccount.update({
        where: { id: body.bankAccountId },
        data: { saldoAtual: { increment: valor } },
      });
    } else if (type === "SAIDA" || type === "RETIRADA_SOCIO") {
      await tx.bankAccount.update({
        where: { id: body.bankAccountId },
        data: { saldoAtual: { decrement: valor } },
      });
    } else if (type === "TRANSFERENCIA") {
      await tx.bankAccount.update({
        where: { id: body.bankAccountId },
        data: { saldoAtual: { decrement: valor } },
      });
      await tx.bankAccount.update({
        where: { id: body.destinoId },
        data: { saldoAtual: { increment: valor } },
      });
    }

    return created;
  });

  return NextResponse.json({ movement });
}
