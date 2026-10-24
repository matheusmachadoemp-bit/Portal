import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { parseDayInput } from "@/lib/timezone";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { balanceDelta } from "@/lib/finance";
import { empresaIdsForContext, getActiveEmpresaContext, requireActiveSingleEmpresa } from "@/lib/empresa";
import { hasModulePermission } from "@/lib/authz";
import { p2002ConstraintIncludes } from "@/lib/prisma-errors";
import { normalizeScannedCode } from "@/lib/boleto-barcode";
import { findPayableDuplicate, formatDuplicateMessage } from "@/lib/boleto-barcode-server";
import {
  CompraError,
  INVOICE_SUMMARY_SELECT,
  parseCompra,
  saveCompraForPayable,
  type ParsedCompra,
} from "@/lib/compra-itens-server";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModulePermission(session.user.id, "financeiro", "canView"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite ver o Financeiro." },
      { status: 403 }
    );
  }

  const ctx = await getActiveEmpresaContext();
  if (!ctx) return NextResponse.json({ error: "Sem acesso a nenhuma loja." }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  const payables = await prisma.payable.findMany({
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
      invoice: { select: INVOICE_SUMMARY_SELECT },
    },
  });

  return NextResponse.json({ payables });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModulePermission(session.user.id, "financeiro", "canCreate"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite criar lançamentos financeiros." },
      { status: 403 }
    );
  }

  const empresa = await requireActiveSingleEmpresa();
  if (!empresa) {
    return NextResponse.json(
      { error: "Selecione uma loja específica (não é possível cadastrar no modo Grupo Nord)." },
      { status: 400 }
    );
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Corpo da requisição inválido (esperado JSON)." }, { status: 400 });
  }
  if (!body.categoriaId || !body.dataCompetencia || !body.dataVencimento) {
    return NextResponse.json(
      { error: "Categoria, competência e vencimento são obrigatórios." },
      { status: 400 }
    );
  }
  // Dias gravados à meia-noite de São Paulo (03:00Z), como no resto do Portal. Ver `parseDayInput`.
  const dataCompetencia = parseDayInput(body.dataCompetencia);
  const dataVencimento = parseDayInput(body.dataVencimento);
  const dataPagamento = body.dataPagamento ? parseDayInput(body.dataPagamento) : null;
  if (!dataCompetencia || !dataVencimento || (body.dataPagamento && !dataPagamento)) {
    return NextResponse.json({ error: "Data inválida. Use o formato AAAA-MM-DD." }, { status: 400 });
  }
  if (!body.fornecedor || !String(body.fornecedor).trim()) {
    return NextResponse.json({ error: "Fornecedor é obrigatório." }, { status: 400 });
  }
  if (!body.descricao || !String(body.descricao).trim()) {
    return NextResponse.json({ error: "Descrição é obrigatória." }, { status: 400 });
  }
  const valor = Number(body.valor);
  if (!body.valor || !Number.isFinite(valor) || valor <= 0) {
    return NextResponse.json({ error: "Valor é obrigatório e deve ser maior que zero." }, { status: 400 });
  }

  // "O que foi comprado" (opcional): validado ANTES de gravar qualquer coisa.
  let compra: ParsedCompra | null = null;
  if (body.compra !== undefined && body.compra !== null) {
    const parsed = parseCompra(body.compra);
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
    compra = parsed.compra;
  }

  // Código de barras do boleto (ou Pix "copia e cola"), lido pelo leitor físico de código de barras
  // (funciona como teclado) ou digitado manualmente: opcional, mas a duplicidade é checada ANTES de
  // tentar gravar (não só pelo erro do Postgres) — ver `findPayableDuplicate` (único GLOBALMENTE,
  // não por loja, de propósito).
  let codigoBarras: string | null = null;
  if (body.codigoBarras !== undefined && body.codigoBarras !== null) {
    // Corta pelo tamanho ANTES de normalizar: `normalizeScannedCode` já é seguro contra ReDoS (a
    // regex não tem como "explodir"), mas não tem por que gastar um `.test()`/`.replace()` em
    // cima de um texto gigante enviado de propósito antes de nem saber se ele é válido.
    const rawCodigo = String(body.codigoBarras);
    if (rawCodigo.length > 500) {
      return NextResponse.json({ error: "Código de barras/Pix inválido (texto longo demais)." }, { status: 400 });
    }
    const normalized = normalizeScannedCode(rawCodigo);
    if (normalized) {
      const duplicate = await findPayableDuplicate(normalized, session.user.id, session.user.role);
      if (duplicate) {
        return NextResponse.json({ error: formatDuplicateMessage(duplicate), duplicate }, { status: 409 });
      }
      codigoBarras = normalized;
    }
  }

  // FinancialCategory é cadastro global (sem empresaId, ver `compra-itens-server.ts`), então basta
  // existir — não há "pertencer à loja" para checar aqui.
  const categoria = await prisma.financialCategory.findUnique({ where: { id: body.categoriaId } });
  if (!categoria) {
    return NextResponse.json({ error: "Categoria financeira não encontrada." }, { status: 400 });
  }

  const status = body.status || "EM_ABERTO";

  const preDelta = balanceDelta(-1, status, valor);
  if (preDelta && body.bankAccountId) {
    const bankAccount = await prisma.bankAccount.findUnique({ where: { id: body.bankAccountId } });
    if (!bankAccount || bankAccount.empresaId !== empresa.id) {
      return NextResponse.json({ error: "Conta bancária inválida para esta loja." }, { status: 400 });
    }
  }

  let payable;
  try {
    payable = await prisma.$transaction(async (tx) => {
      // number vem do id sequencial autoincrementado pelo Postgres (sequence),
      // não de COUNT(*): evita duas requisições simultâneas gerarem o mesmo
      // número (condição de corrida real com o COUNT(*) anterior).
      let created = await tx.payable.create({
        data: {
          number: body.number || "",
          fornecedor: body.fornecedor,
          descricao: body.descricao,
          categoriaId: body.categoriaId,
          centroCusto: body.centroCusto || null,
          empresaId: empresa.id,
          valor,
          dataCompetencia,
          dataVencimento,
          dataPagamento,
          bankAccountId: body.bankAccountId || null,
          formaPagamento: body.formaPagamento || null,
          parcelado: !!body.parcelado,
          quantidadeParcelas: body.quantidadeParcelas ? Number(body.quantidadeParcelas) : null,
          parcelaAtual: body.parcelaAtual ? Number(body.parcelaAtual) : null,
          observacoes: body.observacoes || null,
          status,
          codigoBarras,
          createdById: session.user.id,
        },
      });

      if (!body.number) {
        created = await tx.payable.update({
          where: { id: created.id },
          data: { number: `CP-${String(created.sequence).padStart(5, "0")}` },
        });
      }

      const delta = balanceDelta(-1, status, valor);
      if (delta && created.bankAccountId) {
        await tx.bankAccount.update({
          where: { id: created.bankAccountId },
          data: { saldoAtual: { increment: delta } },
        });
      }

      if (compra) {
        await saveCompraForPayable(tx, {
          userId: session.user.id,
          payable: {
            id: created.id,
            empresaId: created.empresaId,
            fornecedor: created.fornecedor,
            dataCompetencia: created.dataCompetencia,
          },
          compra,
        });
      }

      return created;
    });
  } catch (error) {
    if (error instanceof CompraError) return NextResponse.json({ error: error.message }, { status: 400 });
    // Rede de segurança contra uma corrida entre duas pessoas cadastrando o mesmo código ao mesmo
    // tempo (a checagem de duplicidade acima já rodou ANTES da transação, mas nesse intervalo
    // outra requisição pode ter gravado o mesmo código primeiro): busca de novo pra devolver a
    // mesma resposta 409 estruturada, em vez de um 500 genérico. `?? true`: mesmo fallback seguro
    // usado pelos outros helpers de `p2002ConstraintIncludes` neste app — seguro aqui porque
    // `Payable` só tem uma constraint única extra (`codigoBarras`).
    if (
      codigoBarras &&
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002" &&
      (p2002ConstraintIncludes(error, "codigoBarras") ?? true)
    ) {
      const duplicate = await findPayableDuplicate(codigoBarras, session.user.id, session.user.role);
      if (duplicate) return NextResponse.json({ error: formatDuplicateMessage(duplicate), duplicate }, { status: 409 });
    }
    throw error;
  }

  await prisma.auditLog.create({
    data: {
      userId: session.user.id,
      empresaId: empresa.id,
      action: "CREATE",
      entityType: "Payable",
      entityId: payable.id,
      after: JSON.stringify(payable),
    },
  });

  return NextResponse.json({ payable });
}
