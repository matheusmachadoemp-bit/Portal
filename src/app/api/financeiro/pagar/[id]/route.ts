import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { balanceDelta } from "@/lib/finance";
import type { FinanceEntryStatus } from "@prisma/client";
import { assertEmpresaAccess } from "@/lib/empresa";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const existingCheck = await prisma.payable.findUnique({ where: { id } });
  if (!existingCheck) return NextResponse.json({ error: "Não encontrado." }, { status: 404 });
  if (!(await assertEmpresaAccess(session.user.id, session.user.role, existingCheck.empresaId))) {
    return NextResponse.json({ error: "Sem acesso a essa loja." }, { status: 403 });
  }
  const body = await req.json();

  const updated = await prisma.$transaction(async (tx) => {
    const before = await tx.payable.findUniqueOrThrow({ where: { id } });

    const nextStatus: FinanceEntryStatus = body.status ?? before.status;
    const nextValor = body.valor !== undefined ? Number(body.valor) : before.valor;
    const nextBankAccountId =
      body.bankAccountId !== undefined ? body.bankAccountId : before.bankAccountId;

    // reverte efeito anterior no saldo, aplica o novo (cobre edição de valor/conta/status)
    const oldDelta = balanceDelta(-1, before.status, before.valor);
    if (oldDelta && before.bankAccountId) {
      await tx.bankAccount.update({
        where: { id: before.bankAccountId },
        data: { saldoAtual: { increment: -oldDelta } },
      });
    }
    const newDelta = balanceDelta(-1, nextStatus, nextValor);
    if (newDelta && nextBankAccountId) {
      await tx.bankAccount.update({
        where: { id: nextBankAccountId },
        data: { saldoAtual: { increment: newDelta } },
      });
    }

    const entry = await tx.payable.update({
      where: { id },
      data: {
        number: body.number ?? undefined,
        fornecedor: body.fornecedor ?? undefined,
        descricao: body.descricao ?? undefined,
        categoriaId: body.categoriaId ?? undefined,
        centroCusto: body.centroCusto ?? undefined,
        valor: body.valor !== undefined ? nextValor : undefined,
        dataCompetencia: body.dataCompetencia ? new Date(body.dataCompetencia) : undefined,
        dataVencimento: body.dataVencimento ? new Date(body.dataVencimento) : undefined,
        dataPagamento: body.dataPagamento
          ? new Date(body.dataPagamento)
          : body.dataPagamento === null
          ? null
          : undefined,
        bankAccountId: body.bankAccountId !== undefined ? body.bankAccountId : undefined,
        formaPagamento: body.formaPagamento ?? undefined,
        parcelado: body.parcelado ?? undefined,
        quantidadeParcelas:
          body.quantidadeParcelas !== undefined ? Number(body.quantidadeParcelas) : undefined,
        parcelaAtual: body.parcelaAtual !== undefined ? Number(body.parcelaAtual) : undefined,
        observacoes: body.observacoes ?? undefined,
        status: nextStatus,
      },
    });

    await tx.auditLog.create({
      data: {
        userId: session.user.id,
        empresaId: before.empresaId,
        action: "UPDATE",
        entityType: "Payable",
        entityId: id,
        before: JSON.stringify(before),
        after: JSON.stringify(entry),
      },
    });

    return entry;
  });

  return NextResponse.json({ payable: updated });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const existingCheck = await prisma.payable.findUnique({ where: { id } });
  if (!existingCheck) return NextResponse.json({ error: "Não encontrado." }, { status: 404 });
  if (!(await assertEmpresaAccess(session.user.id, session.user.role, existingCheck.empresaId))) {
    return NextResponse.json({ error: "Sem acesso a essa loja." }, { status: 403 });
  }

  await prisma.$transaction(async (tx) => {
    const before = await tx.payable.findUniqueOrThrow({ where: { id } });
    const delta = balanceDelta(-1, before.status, before.valor);
    if (delta && before.bankAccountId) {
      await tx.bankAccount.update({
        where: { id: before.bankAccountId },
        data: { saldoAtual: { increment: -delta } },
      });
    }
    await tx.payable.delete({ where: { id } });
    await tx.auditLog.create({
      data: {
        userId: session.user.id,
        empresaId: before.empresaId,
        action: "DELETE",
        entityType: "Payable",
        entityId: id,
        before: JSON.stringify(before),
      },
    });
  });

  return NextResponse.json({ ok: true });
}
