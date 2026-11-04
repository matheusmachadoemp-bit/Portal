import { NextResponse } from "next/server";
import { parseDayInput } from "@/lib/timezone";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { balanceDelta } from "@/lib/finance";
import type { FinanceEntryStatus } from "@prisma/client";
import { assertEmpresaAccess } from "@/lib/empresa";
import { hasModulePermission } from "@/lib/authz";

const MANAGER_ROLES = ["ADMINISTRADOR", "GESTOR", "GERENTE", "SUPERVISOR"];

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const existingCheck = await prisma.receivable.findUnique({ where: { id } });
  if (!existingCheck) return NextResponse.json({ error: "Não encontrado." }, { status: 404 });
  if (!(await assertEmpresaAccess(session.user.id, session.user.role, existingCheck.empresaId))) {
    return NextResponse.json({ error: "Sem acesso a essa loja." }, { status: 403 });
  }
  if (!(await hasModulePermission(session.user.id, "financeiro", "canEdit"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite editar lançamentos financeiros." },
      { status: 403 }
    );
  }
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Corpo da requisição inválido (esperado JSON)." }, { status: 400 });
  }

  // Datas: ausente = não mexe; dataRecebimento null = limpa. Gravadas à meia-noite de São Paulo (03:00Z).
  const dataCompetencia = body.dataCompetencia ? parseDayInput(body.dataCompetencia) : undefined;
  const dataVencimento = body.dataVencimento ? parseDayInput(body.dataVencimento) : undefined;
  const dataRecebimento = body.dataRecebimento
    ? parseDayInput(body.dataRecebimento)
    : body.dataRecebimento === null
    ? null
    : undefined;
  if (dataCompetencia === null || dataVencimento === null || (body.dataRecebimento && dataRecebimento === null)) {
    return NextResponse.json({ error: "Data inválida. Use o formato AAAA-MM-DD." }, { status: 400 });
  }

  // FinancialCategory é cadastro global (sem empresaId), então basta existir — só valida quando
  // `categoriaId` é de fato enviado (campo opcional neste PATCH). Mesmo padrão usado em
  // `/api/financeiro/pagar/[id]`.
  if (body.categoriaId !== undefined && body.categoriaId !== null) {
    const categoria = await prisma.financialCategory.findUnique({ where: { id: body.categoriaId } });
    if (!categoria) {
      return NextResponse.json({ error: "Categoria financeira não encontrada." }, { status: 400 });
    }
  }

  // Parcelamento (se é parcelado, quantidade de parcelas, qual é esta parcela) é decidido só na
  // criação — ver `POST /api/financeiro/receber`, que já gera as N parcelas de uma vez (valor
  // dividido, vencimento mês a mês) com um `installmentGroupId` em comum. Esta rota edita sempre UMA
  // parcela isolada (de propósito: a edição nunca deve re-gerar a série inteira), então não dá pra
  // transformar um lançamento comum em parcelado (ou vice-versa) nem trocar a quantidade/posição por
  // aqui sem deixar a série inconsistente com o que foi realmente criado no banco — exclua e cadastre
  // de novo caso precise mudar o parcelamento. Mesmo padrão (e mesma mensagem, adaptada) de
  // `/api/financeiro/pagar/[id]`. O form de edição sempre reenvia os três campos com o valor que já
  // está salvo (mesmo sem o usuário ter tocado neles), então só bloqueamos quando o valor pedido é
  // DIFERENTE do que já está gravado — reenviar o mesmo valor é um no-op.
  const PARCELAMENTO_IMUTAVEL_ERROR =
    "Parcelamento não pode ser alterado depois que a conta é criada (se é parcelado, quantidade de parcelas e qual parcela). Para corrigir, exclua esta conta e cadastre o parcelamento novamente.";
  if (body.parcelado !== undefined && !!body.parcelado !== existingCheck.parcelado) {
    return NextResponse.json({ error: PARCELAMENTO_IMUTAVEL_ERROR }, { status: 400 });
  }
  if (body.quantidadeParcelas !== undefined) {
    const requested =
      body.quantidadeParcelas === "" || body.quantidadeParcelas === null ? null : Number(body.quantidadeParcelas);
    if (requested !== existingCheck.quantidadeParcelas) {
      return NextResponse.json({ error: PARCELAMENTO_IMUTAVEL_ERROR }, { status: 400 });
    }
  }
  if (body.parcelaAtual !== undefined) {
    const requested = body.parcelaAtual === "" || body.parcelaAtual === null ? null : Number(body.parcelaAtual);
    if (requested !== existingCheck.parcelaAtual) {
      return NextResponse.json({ error: PARCELAMENTO_IMUTAVEL_ERROR }, { status: 400 });
    }
  }

  const nextStatusCheck: FinanceEntryStatus = body.status ?? existingCheck.status;
  const nextValorCheck = body.valor !== undefined ? Number(body.valor) : existingCheck.valor;
  const nextBankAccountIdCheck =
    body.bankAccountId !== undefined ? body.bankAccountId : existingCheck.bankAccountId;
  const newDeltaCheck = balanceDelta(1, nextStatusCheck, nextValorCheck);
  if (newDeltaCheck && nextBankAccountIdCheck) {
    const bankAccount = await prisma.bankAccount.findUnique({ where: { id: nextBankAccountIdCheck } });
    if (!bankAccount || bankAccount.empresaId !== existingCheck.empresaId) {
      return NextResponse.json({ error: "Conta bancária inválida para esta loja." }, { status: 400 });
    }
  }

  const updated = await prisma.$transaction(async (tx) => {
    const before = await tx.receivable.findUniqueOrThrow({ where: { id } });

    const nextStatus: FinanceEntryStatus = body.status ?? before.status;
    const nextValor = body.valor !== undefined ? Number(body.valor) : before.valor;
    const nextBankAccountId =
      body.bankAccountId !== undefined ? body.bankAccountId : before.bankAccountId;

    const oldDelta = balanceDelta(1, before.status, before.valor);
    if (oldDelta && before.bankAccountId) {
      await tx.bankAccount.update({
        where: { id: before.bankAccountId },
        data: { saldoAtual: { increment: -oldDelta } },
      });
    }
    const newDelta = balanceDelta(1, nextStatus, nextValor);
    if (newDelta && nextBankAccountId) {
      await tx.bankAccount.update({
        where: { id: nextBankAccountId },
        data: { saldoAtual: { increment: newDelta } },
      });
    }

    const entry = await tx.receivable.update({
      where: { id },
      data: {
        number: body.number ?? undefined,
        cliente: body.cliente ?? undefined,
        descricao: body.descricao ?? undefined,
        categoriaId: body.categoriaId ?? undefined,
        centroCusto: body.centroCusto ?? undefined,
        valor: body.valor !== undefined ? nextValor : undefined,
        dataCompetencia,
        dataVencimento,
        dataRecebimento,
        bankAccountId: body.bankAccountId !== undefined ? body.bankAccountId || null : undefined,
        formaRecebimento: body.formaRecebimento ?? undefined,
        // `parcelado`/`quantidadeParcelas`/`parcelaAtual` NUNCA são escritos aqui de propósito — já
        // foram validados acima como imutáveis depois da criação (ver bloco
        // `PARCELAMENTO_IMUTAVEL_ERROR`): se chegou até aqui, ou não vieram no body, ou vieram iguais
        // ao que já está salvo, então não há nada a regravar.
        observacoes: body.observacoes ?? undefined,
        status: nextStatus,
      },
    });

    await tx.auditLog.create({
      data: {
        userId: session.user.id,
        empresaId: before.empresaId,
        action: "UPDATE",
        entityType: "Receivable",
        entityId: id,
        before: JSON.stringify(before),
        after: JSON.stringify(entry),
      },
    });

    return entry;
  });

  return NextResponse.json({ receivable: updated });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!MANAGER_ROLES.includes(session.user.role)) {
    return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  }
  const { id } = await params;
  const existingCheck = await prisma.receivable.findUnique({ where: { id } });
  if (!existingCheck) return NextResponse.json({ error: "Não encontrado." }, { status: 404 });
  if (!(await assertEmpresaAccess(session.user.id, session.user.role, existingCheck.empresaId))) {
    return NextResponse.json({ error: "Sem acesso a essa loja." }, { status: 403 });
  }
  if (!(await hasModulePermission(session.user.id, "financeiro", "canDelete"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite excluir lançamentos financeiros." },
      { status: 403 }
    );
  }

  await prisma.$transaction(async (tx) => {
    const before = await tx.receivable.findUniqueOrThrow({ where: { id } });
    const delta = balanceDelta(1, before.status, before.valor);
    if (delta && before.bankAccountId) {
      await tx.bankAccount.update({
        where: { id: before.bankAccountId },
        data: { saldoAtual: { increment: -delta } },
      });
    }
    await tx.receivable.delete({ where: { id } });
    await tx.auditLog.create({
      data: {
        userId: session.user.id,
        empresaId: before.empresaId,
        action: "DELETE",
        entityType: "Receivable",
        entityId: id,
        before: JSON.stringify(before),
      },
    });
  });

  return NextResponse.json({ ok: true });
}
