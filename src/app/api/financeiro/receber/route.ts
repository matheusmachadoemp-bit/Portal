import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { balanceDelta } from "@/lib/finance";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const empresa = searchParams.get("empresa");
  const status = searchParams.get("status");
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  const receivables = await prisma.receivable.findMany({
    where: {
      ...(empresa && empresa !== "ALL" ? { empresa: empresa as never } : {}),
      ...(status ? { status: status as never } : {}),
      ...(from && to ? { dataVencimento: { gte: new Date(from), lte: new Date(to) } } : {}),
    },
    orderBy: { dataVencimento: "asc" },
    include: { categoria: true, bankAccount: true, createdBy: { select: { name: true } } },
  });

  return NextResponse.json({ receivables });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  if (!body.categoriaId || !body.empresa || !body.dataCompetencia || !body.dataVencimento) {
    return NextResponse.json(
      { error: "Categoria, empresa, competência e vencimento são obrigatórios." },
      { status: 400 }
    );
  }

  const status = body.status || "EM_ABERTO";
  const valor = Number(body.valor) || 0;

  const receivable = await prisma.$transaction(async (tx) => {
    const count = await tx.receivable.count();
    const created = await tx.receivable.create({
      data: {
        number: body.number || `CR-${String(count + 1).padStart(5, "0")}`,
        cliente: body.cliente,
        descricao: body.descricao,
        categoriaId: body.categoriaId,
        centroCusto: body.centroCusto || null,
        empresa: body.empresa,
        valor,
        dataCompetencia: new Date(body.dataCompetencia),
        dataVencimento: new Date(body.dataVencimento),
        dataRecebimento: body.dataRecebimento ? new Date(body.dataRecebimento) : null,
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
      action: "CREATE",
      entityType: "Receivable",
      entityId: receivable.id,
      after: JSON.stringify(receivable),
    },
  });

  return NextResponse.json({ receivable });
}
