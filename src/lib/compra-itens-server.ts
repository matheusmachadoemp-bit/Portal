import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  buildPriceHints,
  computeTotals,
  isAboveAgreed,
  normalizeItems,
  resolveDivergence,
  type DivergenceChoice,
  type DivergenceStatus,
  type HistoryInvoice,
  type InvoiceTotals,
  type NormalizedItem,
} from "@/lib/compra-itens";

/** O que a lista de Contas a Pagar precisa saber da compra de cada boleto (sem carregar os itens). */
export const INVOICE_SUMMARY_SELECT = {
  id: true,
  numeroNota: true,
  totalCobrado: true,
  totalCombinado: true,
  totalComparado: true,
  divergenciaStatus: true,
  divergenciaMotivo: true,
} as const;

export type ParsedCompra = {
  supplierId: string | null;
  numeroNota: string | null;
  items: NormalizedItem[];
  totals: InvoiceTotals;
  choice: DivergenceChoice | null;
};

function cleanText(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const text = value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
  return text || null;
}

/** Lê o bloco `compra` enviado pela tela (sem tocar no banco). */
export function parseCompra(raw: unknown): { ok: true; compra: ParsedCompra } | { ok: false; error: string } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, error: "Dados da compra inválidos." };
  const body = raw as Record<string, unknown>;
  const parsed = normalizeItems(body.itens);
  if (!parsed.ok) return parsed;

  let supplierId: string | null = null;
  if (body.supplierId !== undefined && body.supplierId !== null && body.supplierId !== "") {
    if (typeof body.supplierId !== "string" || body.supplierId.length > 100) return { ok: false, error: "Fornecedor inválido." };
    supplierId = body.supplierId;
  }
  const choice =
    body.divergencia && typeof body.divergencia === "object" && !Array.isArray(body.divergencia)
      ? (body.divergencia as DivergenceChoice)
      : null;

  return {
    ok: true,
    compra: {
      supplierId,
      numeroNota: cleanText(body.numeroNota, 60),
      items: parsed.items,
      totals: computeTotals(parsed.items),
      choice,
    },
  };
}

type Tx = Prisma.TransactionClient;

export class CompraError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CompraError";
  }
}

/**
 * Cria ou atualiza a compra de um boleto (e liga os dois). Tudo na transação de quem chama.
 * - A loja da compra é SEMPRE a do boleto (nunca vem do corpo da requisição).
 * - Fornecedor e insumos precisam ser desta loja; o nome do insumo gravado é o do cadastro.
 * - Se a compra já existia, os itens são substituídos por inteiro.
 */
export async function saveCompraForPayable(
  tx: Tx,
  args: {
    userId: string;
    payable: { id: string; empresaId: string; fornecedor: string; dataCompetencia: Date; invoiceId: string | null };
    compra: ParsedCompra;
  }
) {
  const { userId, payable, compra } = args;

  if (compra.supplierId) {
    const supplier = await tx.supplier.findFirst({ where: { id: compra.supplierId, empresaId: payable.empresaId }, select: { id: true } });
    if (!supplier) throw new CompraError("Fornecedor não encontrado nesta loja.");
  }

  const ingredientIds = [...new Set(compra.items.map((i) => i.ingredientId).filter((id): id is string => !!id))];
  const names = new Map<string, string>();
  if (ingredientIds.length > 0) {
    const found = await tx.ingredient.findMany({ where: { id: { in: ingredientIds }, empresaId: payable.empresaId }, select: { id: true, name: true } });
    for (const f of found) names.set(f.id, f.name);
    const missing = ingredientIds.filter((id) => !names.has(id));
    if (missing.length > 0) throw new CompraError("Um dos insumos escolhidos não existe mais nesta loja. Atualize a página e escolha de novo.");
  }
  const items = compra.items.map((i) => (i.ingredientId ? { ...i, nome: (names.get(i.ingredientId) ?? i.nome).slice(0, 120) } : i));

  const current = payable.invoiceId
    ? await tx.supplierInvoice.findFirst({
        where: { id: payable.invoiceId, empresaId: payable.empresaId },
        select: { id: true, divergenciaStatus: true, divergenciaMotivo: true, divergenciaObservacao: true },
      })
    : null;

  const decision = resolveDivergence(
    isAboveAgreed(compra.totals),
    compra.choice,
    current ? { status: current.divergenciaStatus, motivo: current.divergenciaMotivo, observacao: current.divergenciaObservacao } : null
  );
  if (!decision.ok) throw new CompraError(decision.error);
  const d = decision.decision;
  const resolved = d.status === "ACEITA";

  const header = {
    supplierId: compra.supplierId,
    fornecedorNome: payable.fornecedor.slice(0, 200),
    numeroNota: compra.numeroNota,
    dataCompra: payable.dataCompetencia,
    totalCobrado: compra.totals.totalCobrado,
    totalCombinado: compra.totals.totalCombinado,
    totalComparado: compra.totals.totalComparado,
    divergenciaStatus: d.status,
    divergenciaMotivo: d.motivo,
    divergenciaObservacao: d.observacao,
    divergenciaResolvidaEm: resolved ? new Date() : null,
    divergenciaResolvidaPorId: resolved ? userId : null,
  };
  const itemRows = items.map((i) => ({
    ordem: i.ordem,
    kind: i.kind,
    ingredientId: i.ingredientId,
    nome: i.nome,
    grupo: i.grupo,
    quantidade: i.quantidade,
    unidade: i.unidade,
    precoCombinado: i.precoCombinado,
    origemCombinado: i.origemCombinado,
    precoCobrado: i.precoCobrado,
    total: i.total,
  }));

  let invoiceId: string;
  if (current) {
    await tx.supplierInvoice.update({ where: { id: current.id }, data: header });
    await tx.supplierInvoiceItem.deleteMany({ where: { invoiceId: current.id } });
    await tx.supplierInvoiceItem.createMany({ data: itemRows.map((r) => ({ ...r, invoiceId: current.id })) });
    invoiceId = current.id;
  } else {
    const created = await tx.supplierInvoice.create({
      data: { ...header, empresaId: payable.empresaId, createdById: userId, items: { create: itemRows } },
      select: { id: true },
    });
    invoiceId = created.id;
    await tx.payable.update({ where: { id: payable.id }, data: { invoiceId } });
  }

  await tx.auditLog.create({
    data: {
      userId,
      empresaId: payable.empresaId,
      action: current ? "UPDATE" : "CREATE",
      entityType: "SupplierInvoice",
      entityId: invoiceId,
      after: JSON.stringify({ payableId: payable.id, itens: itemRows.length, ...compra.totals, divergencia: d }),
    },
  });

  return { invoiceId, decision: d };
}

/** Desliga a compra do boleto e apaga a compra se não sobrou nenhum boleto ligado a ela. */
export async function detachCompraFromPayable(tx: Tx, args: { userId: string; payable: { id: string; empresaId: string; invoiceId: string | null } }) {
  const { payable, userId } = args;
  if (!payable.invoiceId) return;
  await tx.payable.update({ where: { id: payable.id }, data: { invoiceId: null } });
  await deleteInvoiceIfOrphan(tx, payable.invoiceId, payable.empresaId, userId);
}

export async function deleteInvoiceIfOrphan(tx: Tx, invoiceId: string, empresaId: string, userId: string) {
  const remaining = await tx.payable.count({ where: { invoiceId } });
  if (remaining > 0) return;
  const deleted = await tx.supplierInvoice.deleteMany({ where: { id: invoiceId, empresaId } });
  if (deleted.count > 0) {
    await tx.auditLog.create({
      data: { userId, empresaId, action: "DELETE", entityType: "SupplierInvoice", entityId: invoiceId },
    });
  }
}

/** A compra de um boleto, com os itens na ordem em que foram digitados. */
export async function loadCompraOfPayable(payableId: string, empresaId: string) {
  const payable = await prisma.payable.findFirst({ where: { id: payableId, empresaId }, select: { invoiceId: true } });
  if (!payable?.invoiceId) return null;
  return prisma.supplierInvoice.findFirst({
    where: { id: payable.invoiceId, empresaId },
    include: { items: { orderBy: { ordem: "asc" } } },
  });
}

/**
 * Compras anteriores do fornecedor: a mais recente (para "Repetir última compra") e o último preço de
 * cada produto (sugestão de "combinado"). Casa pelo fornecedor cadastrado OU pelo nome digitado.
 */
export async function loadSupplierHistory(empresaId: string, ref: { supplierId: string | null; fornecedor: string }) {
  const or: Prisma.SupplierInvoiceWhereInput[] = [];
  if (ref.supplierId) or.push({ supplierId: ref.supplierId });
  if (ref.fornecedor.trim()) or.push({ fornecedorNome: { equals: ref.fornecedor.trim(), mode: "insensitive" } });
  if (or.length === 0) return { ultimaCompra: null, hints: {} };

  const invoices = await prisma.supplierInvoice.findMany({
    where: { empresaId, OR: or },
    orderBy: [{ dataCompra: "desc" }, { createdAt: "desc" }],
    take: 12,
    include: { items: { orderBy: { ordem: "asc" } } },
  });

  const history: HistoryInvoice[] = invoices.map((inv) => ({
    id: inv.id,
    dataCompra: inv.dataCompra,
    divergenciaStatus: inv.divergenciaStatus as DivergenceStatus,
    items: inv.items.map((it) => ({
      kind: it.kind,
      ingredientId: it.ingredientId,
      nome: it.nome,
      grupo: it.grupo,
      quantidade: it.quantidade,
      unidade: it.unidade,
      precoCombinado: it.precoCombinado,
      origemCombinado: it.origemCombinado,
      precoCobrado: it.precoCobrado,
    })),
  }));
  const hints = buildPriceHints(history);

  const last = invoices[0];
  return {
    hints,
    ultimaCompra: last
      ? {
          id: last.id,
          dataCompra: last.dataCompra.toISOString(),
          numeroNota: last.numeroNota,
          totalCobrado: last.totalCobrado,
          itens: last.items.map((it) => ({
            kind: it.kind,
            ingredientId: it.ingredientId,
            nome: it.nome,
            grupo: it.grupo,
            quantidade: it.quantidade,
            unidade: it.unidade,
            precoCombinado: it.precoCombinado,
            origemCombinado: it.origemCombinado,
            precoCobrado: it.precoCobrado,
          })),
        }
      : null,
  };
}
