import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseDayInput } from "@/lib/timezone";
import { auth } from "@/auth";
import { balanceDelta } from "@/lib/finance";
import { Prisma, type FinanceEntryStatus } from "@prisma/client";
import { assertEmpresaAccess } from "@/lib/empresa";
import { hasModulePermission } from "@/lib/authz";
import { normalizeSupplierKey } from "@/lib/compra-itens";
import { p2002ConstraintIncludes } from "@/lib/prisma-errors";
import { normalizeScannedCode } from "@/lib/boleto-barcode";
import { findPayableDuplicate, formatDuplicateMessage } from "@/lib/boleto-barcode-server";
import {
  CompraError,
  deleteInvoiceIfOrphan,
  detachCompraFromPayable,
  parseCompra,
  saveCompraForPayable,
  type ParsedCompra,
} from "@/lib/compra-itens-server";

const MANAGER_ROLES = ["ADMINISTRADOR", "GESTOR", "GERENTE", "SUPERVISOR"];

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const existingCheck = await prisma.payable.findUnique({ where: { id } });
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

  // Datas: ausente = não mexe; dataPagamento null = limpa. Gravadas à meia-noite de São Paulo (03:00Z).
  const dataCompetencia = body.dataCompetencia ? parseDayInput(body.dataCompetencia) : undefined;
  const dataVencimento = body.dataVencimento ? parseDayInput(body.dataVencimento) : undefined;
  const dataPagamento = body.dataPagamento
    ? parseDayInput(body.dataPagamento)
    : body.dataPagamento === null
    ? null
    : undefined;
  if (dataCompetencia === null || dataVencimento === null || (body.dataPagamento && dataPagamento === null)) {
    return NextResponse.json({ error: "Data inválida. Use o formato AAAA-MM-DD." }, { status: 400 });
  }

  // "O que foi comprado": ausente = não mexe; null = tira os itens; objeto = grava (substitui os itens).
  let compra: ParsedCompra | null | undefined;
  if (body.compra === null) compra = null;
  else if (body.compra !== undefined) {
    const parsed = parseCompra(body.compra);
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
    compra = parsed.compra;
  }

  // Código de barras do boleto (ou Pix "copia e cola"): ausente = não mexe; vazio/null = limpa;
  // valor novo = normaliza e checa duplicidade ANTES de gravar (não só pelo erro do Postgres),
  // excluindo o PRÓPRIO lançamento da checagem (ele não é duplicado dele mesmo). Único
  // GLOBALMENTE, não por loja — ver `findPayableDuplicate`.
  let codigoBarras: string | null | undefined;
  if (body.codigoBarras === null) {
    codigoBarras = null;
  } else if (body.codigoBarras !== undefined) {
    // Corta pelo tamanho ANTES de normalizar: `normalizeScannedCode` já é seguro contra ReDoS (a
    // regex não tem como "explodir"), mas não tem por que gastar um `.test()`/`.replace()` em
    // cima de um texto gigante enviado de propósito antes de nem saber se ele é válido.
    const rawCodigo = String(body.codigoBarras);
    if (rawCodigo.length > 500) {
      return NextResponse.json({ error: "Código de barras/Pix inválido (texto longo demais)." }, { status: 400 });
    }
    const normalized = normalizeScannedCode(rawCodigo);
    if (!normalized) {
      codigoBarras = null;
    } else {
      const duplicate = await findPayableDuplicate(normalized, session.user.id, session.user.role, id);
      if (duplicate) {
        return NextResponse.json({ error: formatDuplicateMessage(duplicate), duplicate }, { status: 409 });
      }
      codigoBarras = normalized;
    }
  }

  // FinancialCategory é cadastro global (sem empresaId, ver `compra-itens-server.ts`), então basta
  // existir — só valida quando `categoriaId` é de fato enviado (campo opcional neste PATCH).
  if (body.categoriaId !== undefined && body.categoriaId !== null) {
    const categoria = await prisma.financialCategory.findUnique({ where: { id: body.categoriaId } });
    if (!categoria) {
      return NextResponse.json({ error: "Categoria financeira não encontrada." }, { status: 400 });
    }
  }

  const nextStatusCheck: FinanceEntryStatus = body.status ?? existingCheck.status;
  const nextValorCheck = body.valor !== undefined ? Number(body.valor) : existingCheck.valor;
  const nextBankAccountIdCheck =
    body.bankAccountId !== undefined ? body.bankAccountId : existingCheck.bankAccountId;
  const newDeltaCheck = balanceDelta(-1, nextStatusCheck, nextValorCheck);
  if (newDeltaCheck && nextBankAccountIdCheck) {
    const bankAccount = await prisma.bankAccount.findUnique({ where: { id: nextBankAccountIdCheck } });
    if (!bankAccount || bankAccount.empresaId !== existingCheck.empresaId) {
      return NextResponse.json({ error: "Conta bancária inválida para esta loja." }, { status: 400 });
    }
  }

  let updated;
  try {
    updated = await prisma.$transaction(async (tx) => {
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
          dataCompetencia,
          dataVencimento,
          dataPagamento,
          bankAccountId: body.bankAccountId !== undefined ? body.bankAccountId || null : undefined,
          formaPagamento: body.formaPagamento ?? undefined,
          parcelado: body.parcelado ?? undefined,
          quantidadeParcelas:
            body.quantidadeParcelas !== undefined ? Number(body.quantidadeParcelas) : undefined,
          parcelaAtual: body.parcelaAtual !== undefined ? Number(body.parcelaAtual) : undefined,
          observacoes: body.observacoes ?? undefined,
          status: nextStatus,
          codigoBarras,
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

      if (compra) {
        await saveCompraForPayable(tx, {
          userId: session.user.id,
          payable: {
            id,
            empresaId: before.empresaId,
            fornecedor: entry.fornecedor,
            dataCompetencia: entry.dataCompetencia,
          },
          compra,
        });
      } else if (compra === null) {
        await detachCompraFromPayable(tx, {
          userId: session.user.id,
          payable: { id, empresaId: before.empresaId },
        });
      } else if (
        entry.invoiceId &&
        (entry.fornecedor !== before.fornecedor || entry.dataCompetencia.getTime() !== before.dataCompetencia.getTime())
      ) {
        // Mudou o fornecedor ou a competência do boleto: a compra acompanha. Sem a tela reenviando a compra,
        // não dá para saber se o novo nome é um fornecedor cadastrado: o vínculo por id é solto e a busca
        // passa a valer pelo nome.
        await tx.supplierInvoice.updateMany({
          where: { id: entry.invoiceId, empresaId: before.empresaId },
          data: {
            fornecedorNome: entry.fornecedor.slice(0, 200),
            fornecedorChave: normalizeSupplierKey(entry.fornecedor),
            dataCompra: entry.dataCompetencia,
            ...(entry.fornecedor !== before.fornecedor ? { supplierId: null } : {}),
          },
        });
      }

      return entry;
    });
  } catch (error) {
    if (error instanceof CompraError) return NextResponse.json({ error: error.message }, { status: 400 });
    // Rede de segurança contra uma corrida entre duas pessoas editando ao mesmo tempo (mesmo
    // raciocínio do POST, ver comentário lá): a checagem de duplicidade acima já rodou antes da
    // transação, mas busca de novo aqui garante a mesma resposta 409 estruturada em vez de 500.
    if (
      codigoBarras &&
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002" &&
      (p2002ConstraintIncludes(error, "codigoBarras") ?? true)
    ) {
      const duplicate = await findPayableDuplicate(codigoBarras, session.user.id, session.user.role, id);
      if (duplicate) return NextResponse.json({ error: formatDuplicateMessage(duplicate), duplicate }, { status: 409 });
    }
    throw error;
  }

  return NextResponse.json({ payable: updated });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!MANAGER_ROLES.includes(session.user.role)) {
    return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  }
  const { id } = await params;
  const existingCheck = await prisma.payable.findUnique({ where: { id } });
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
    const before = await tx.payable.findUniqueOrThrow({ where: { id } });
    const delta = balanceDelta(-1, before.status, before.valor);
    if (delta && before.bankAccountId) {
      await tx.bankAccount.update({
        where: { id: before.bankAccountId },
        data: { saldoAtual: { increment: -delta } },
      });
    }
    await tx.payable.delete({ where: { id } });
    if (before.invoiceId) await deleteInvoiceIfOrphan(tx, before.invoiceId, before.empresaId, session.user.id);
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
