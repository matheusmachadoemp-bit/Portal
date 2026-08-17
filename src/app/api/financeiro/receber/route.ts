import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { balanceDelta } from "@/lib/finance";
import { empresaIdsForContext, getActiveEmpresaContext, requireActiveSingleEmpresa } from "@/lib/empresa";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ctx = await getActiveEmpresaContext();
  if (!ctx) return NextResponse.json({ error: "Sem acesso a nenhuma loja." }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  const receivables = await prisma.receivable.findMany({
    where: {
      empresaId: { in: empresaIdsForContext(ctx) },
      ...(status ? { status: status as never } : {}),
      ...(from && to ? { dataVencimento: { gte: new Date(from), lte: new Date(to) } } : {}),
    },
    orderBy: { dataVencimento: "asc" },
    include: {
      categoria: { select: { name: true } },
      createdBy: { select: { name: true } },
      empresa: { select: { name: true } },
    },
  });

  return NextResponse.json({ receivables });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const empresa = await requireActiveSingleEmpresa();
  if (!empresa) {
    return NextResponse.json(
      { error: "Selecione uma loja específica (não é possível cadastrar no modo Grupo Nord)." },
      { status: 400 }
    );
  }

  const body = await req.json();
  if (!body.categoriaId || !body.dataCompetencia || !body.dataVencimento) {
    return NextResponse.json(
      { error: "Categoria, competência e vencimento são obrigatórios." },
      { status: 400 }
    );
  }

  const status = body.status || "EM_ABERTO";
  const valor = Number(body.valor) || 0;

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
