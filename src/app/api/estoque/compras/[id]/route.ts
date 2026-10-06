import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { assertEmpresaAccess } from "@/lib/empresa";
import { hasModulePermission } from "@/lib/authz";
import { logPurchaseEvent } from "@/lib/recebimento-server";
import { isValidBlobUrl } from "@/lib/manutencao-server";
import { PAYMENT_METHOD_LABEL } from "@/lib/vendas-analytics";
import { RECEBIMENTO_MANAGE_ROLES } from "@/lib/estoque";

// Campos de cabeçalho que só podem ser editados enquanto a compra ainda não foi recebida — ver
// bloqueio logo abaixo de `willReceive`. `status`, `numeroNota`, `notaFiscalUrl` e `observacoes`
// NÃO entram aqui de propósito: já eram editáveis antes desta tarefa (mesmo depois de recebido) e
// esse comportamento não muda.
const LOCKABLE_HEADER_FIELDS = [
  "supplierId",
  "data",
  "previsaoEntrega",
  "compradorResponsavel",
  "formaPagamento",
  "dataVencimento",
  "desconto",
  "frete",
] as const;

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // Checagem de cargo (RECEBIMENTO_MANAGE_ROLES, mesma usada em GET/POST de
  // /api/estoque/compras — achado do Jonas, 2026-10-01, sobre exposição de preço pago).
  // `hasModulePermission(..., "canEdit")` abaixo sozinho não bastava: qualquer COLABORADOR com
  // essa permissão de perfil ligada (sem precisar de cargo nenhum) conseguia editar
  // fornecedor/datas/desconto/frete/quantidade/valor unitário de um pedido de compra via PATCH
  // direto, mesmo sem acesso à tela de Compras — inclusive um colaborador que só tem acesso
  // legítimo à tela de Recebimento de Mercadorias (de onde já vê o `purchaseId`). Roda antes de
  // qualquer busca no banco, igual ao GET/POST, pra não gastar uma query em quem nem pode chamar
  // essa rota.
  if (!RECEBIMENTO_MANAGE_ROLES.includes(session.user.role)) {
    return NextResponse.json(
      {
        error:
          "Editar pedidos de compra é restrito a Administrador, Gestor, Gerente ou Supervisor. Para conferir ou dar entrada numa mercadoria, use Estoque > Recebimento de Mercadorias.",
      },
      { status: 403 }
    );
  }
  const { id } = await params;
  const body = await req.json();

  if (body.notaFiscalUrl && !isValidBlobUrl(body.notaFiscalUrl)) {
    return NextResponse.json({ error: "URL de arquivo inválida." }, { status: 400 });
  }

  const existing = await prisma.purchase.findUnique({
    where: { id },
    include: { items: { include: { ingredient: true } }, receiving: true, supplier: true },
  });
  if (!existing) return NextResponse.json({ error: "Não encontrada." }, { status: 404 });
  if (!(await assertEmpresaAccess(session.user.id, session.user.role, existing.empresaId))) {
    return NextResponse.json({ error: "Sem acesso a essa loja." }, { status: 403 });
  }
  if (!(await hasModulePermission(session.user.id, "estoque", "canEdit"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite editar pedidos de compra." },
      { status: 403 }
    );
  }

  const willReceive = body.status === "RECEBIDO" && existing.status !== "RECEBIDO" && !existing.receiving;

  // Trava de edição pós-recebimento: "Marcar recebido" (bloco `willReceive` abaixo) já dispara
  // StockMovement + incremento de Ingredient.estoqueAtual + Ingredient.precoAtual/priceHistory a
  // partir da quantidade/valorUnitario de cada item NAQUELE MOMENTO. Editar itens ou os campos de
  // cabeçalho abaixo DEPOIS disso deixaria esses efeitos já aplicados desatualizados/incoerentes
  // com o novo valor — corrigir isso exigiria reverter/reconciliar estoque e custo, fora do escopo
  // desta tarefa ("Editar pedido de compra", 2026-10). `willReceive` também entra aqui (e não só
  // `existing.status`/`existing.receiving`, que refletem o estado ANTES desta requisição): sem
  // isso, um body que combinasse `status: "RECEBIDO"` com `items`/campos de cabeçalho no mesmo
  // request aplicaria a edição e o snapshot de recebimento em ordens que poderiam ficar
  // inconsistentes entre si. Nenhuma tela hoje manda os dois juntos (botão "Marcar recebido" só
  // manda `status`), mas é barato travar aqui também em vez de confiar nisso.
  if ((body.items !== undefined || LOCKABLE_HEADER_FIELDS.some((f) => body[f] !== undefined)) && (existing.status === "RECEBIDO" || !!existing.receiving || willReceive)) {
    return NextResponse.json(
      {
        error:
          "Este pedido já foi recebido (ou está sendo marcado como recebido nesta mesma requisição) — não é possível editar fornecedor, datas, forma de pagamento, desconto, frete ou os itens depois do recebimento confirmado.",
      },
      { status: 400 }
    );
  }

  if (willReceive) {
    await prisma.$transaction([
      prisma.receiving.create({
        data: {
          purchaseId: existing.id,
          empresaId: existing.empresaId,
          responsavel: body.responsavel || session.user.name || null,
          status: "APROVADO",
          // Mesmo caso de POST /api/estoque/recebimento: este fluxo ("Marcar recebido" na tela de
          // Compras) é síncrono e sem conferência item a item — o recebimento já nasce concluído,
          // sem fase "em andamento" intermediária. Sem dataFim, nunca apareceria nos KPIs do
          // dashboard gerencial (loadRecebimentoDashboard, src/lib/recebimento-server.ts, que filtra
          // tudo por dataFim), igual ao bug original encontrado no fluxo interno da tela Recebimento.
          dataFim: new Date(),
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
            estoqueAtual: { increment: item.quantidade },
            precoAtual: item.valorUnitario,
            lastPurchaseDate: new Date(),
            ...(item.valorUnitario !== item.ingredient.precoAtual ? { priceHistory: { create: { price: item.valorUnitario } } } : {}),
          },
        })
      ),
      // Este fluxo ("Marcar recebido" na tela de Compras) não tem conferência item a item — é
      // "confirma tudo exatamente como foi pedido" (por isso o StockMovement acima já usa
      // `item.quantidade` direto, sem nenhum mapa de quantidades recebidas vindo do body). Por
      // isso, diferente de POST /api/estoque/recebimento e do link público de recebimento
      // (responder/[token]/finalizar), aqui `quantidadeRecebida` só pode ser a quantidade PEDIDA —
      // é o único dado disponível nesta tela. Sem isso, o relatório "Gasto por Insumo"
      // (computeGastoPorInsumoRows, src/lib/recebimento-server.ts) ficava com `quantidadeRecebida`
      // nula pra toda compra confirmada por este botão, caindo no fallback (mesmo valor, só que por
      // acidente em vez de por gravação explícita) — grava explícito aqui pra não depender do
      // fallback nesse caso, que é o normal (não uma exceção do histórico antigo).
      ...existing.items.map((item) =>
        prisma.purchaseItem.update({
          where: { id: item.id },
          data: { quantidadeRecebida: item.quantidade },
        })
      ),
    ]);

    await logPurchaseEvent({
      purchaseId: existing.id,
      empresaId: existing.empresaId,
      action: "Recebimento confirmado (tela de Compras)",
      userId: session.user.id,
    });
  }

  // --- Edição de cabeçalho (fornecedor, datas, forma de pagamento, desconto, frete) ---
  // O fornecedor precisa pertencer à mesma loja da compra — mesma checagem de
  // POST /api/estoque/compras, pra não deixar uma compra passar a referenciar um fornecedor de
  // outra loja (contaminaria o histórico de recebimento/divergências desse fornecedor).
  if (body.supplierId !== undefined) {
    if (typeof body.supplierId !== "string" || !body.supplierId) {
      return NextResponse.json({ error: "Fornecedor inválido." }, { status: 400 });
    }
    const supplier = await prisma.supplier.findUnique({ where: { id: body.supplierId }, select: { empresaId: true } });
    if (!supplier) {
      return NextResponse.json({ error: "Fornecedor não encontrado." }, { status: 400 });
    }
    if (supplier.empresaId !== existing.empresaId) {
      return NextResponse.json({ error: "Esse fornecedor não pertence a esta loja." }, { status: 400 });
    }
  }

  if (body.formaPagamento && !(body.formaPagamento in PAYMENT_METHOD_LABEL)) {
    return NextResponse.json({ error: "Forma de pagamento inválida." }, { status: 400 });
  }

  let parsedData: Date | undefined;
  if (body.data !== undefined) {
    if (!body.data) {
      return NextResponse.json({ error: "Data da compra é obrigatória." }, { status: 400 });
    }
    parsedData = new Date(body.data);
    if (Number.isNaN(parsedData.getTime())) {
      return NextResponse.json({ error: "Data da compra inválida." }, { status: 400 });
    }
  }

  let parsedPrevisao: Date | null | undefined;
  if (body.previsaoEntrega !== undefined) {
    if (!body.previsaoEntrega) {
      parsedPrevisao = null;
    } else {
      parsedPrevisao = new Date(body.previsaoEntrega);
      if (Number.isNaN(parsedPrevisao.getTime())) {
        return NextResponse.json({ error: "Previsão de entrega inválida." }, { status: 400 });
      }
    }
  }

  let parsedVencimento: Date | null | undefined;
  if (body.dataVencimento !== undefined) {
    if (!body.dataVencimento) {
      parsedVencimento = null;
    } else {
      parsedVencimento = new Date(body.dataVencimento);
      if (Number.isNaN(parsedVencimento.getTime())) {
        return NextResponse.json({ error: "Data de vencimento inválida." }, { status: 400 });
      }
    }
  }

  // --- Edição de itens já existentes ---
  // Só edita quantidade/valorUnitario de itens que já existem nesta compra — adicionar ou remover
  // item da lista não está incluído nesta fase (ver relatório da tarefa). Cada `id` é validado
  // contra `existing.items` antes de qualquer update: nunca confia em id vindo do client sem
  // checar que pertence mesmo a esta Purchase.
  const itemsToUpdate: { id: string; quantidade: number; valorUnitario: number; valorTotal: number }[] = [];
  if (body.items !== undefined) {
    if (!Array.isArray(body.items)) {
      return NextResponse.json({ error: "Lista de itens inválida." }, { status: 400 });
    }
    const existingItemIds = new Set(existing.items.map((it) => it.id));
    const seenIds = new Set<string>();
    for (const raw of body.items as { id?: unknown; quantidade?: unknown; valorUnitario?: unknown }[]) {
      if (!raw || typeof raw.id !== "string" || !existingItemIds.has(raw.id)) {
        return NextResponse.json({ error: "Um dos itens enviados não pertence a este pedido de compra." }, { status: 400 });
      }
      if (seenIds.has(raw.id)) {
        return NextResponse.json({ error: "Item duplicado na lista de itens." }, { status: 400 });
      }
      seenIds.add(raw.id);
      const quantidade = Number(raw.quantidade);
      const valorUnitario = Number(raw.valorUnitario);
      if (!Number.isFinite(quantidade) || quantidade <= 0) {
        return NextResponse.json({ error: "Quantidade inválida em um dos itens." }, { status: 400 });
      }
      if (!Number.isFinite(valorUnitario) || valorUnitario < 0) {
        return NextResponse.json({ error: "Valor unitário inválido em um dos itens." }, { status: 400 });
      }
      itemsToUpdate.push({ id: raw.id, quantidade, valorUnitario, valorTotal: quantidade * valorUnitario });
    }
  }

  const wantsItemsEdit = body.items !== undefined;
  const wantsHeaderEdit = LOCKABLE_HEADER_FIELDS.some((f) => body[f] !== undefined);

  const updateData = {
    status: body.status ?? undefined,
    numeroNota: body.numeroNota !== undefined ? body.numeroNota || null : undefined,
    notaFiscalUrl: body.notaFiscalUrl !== undefined ? body.notaFiscalUrl || null : undefined,
    observacoes: body.observacoes !== undefined ? body.observacoes || null : undefined,
    supplierId: body.supplierId !== undefined ? (body.supplierId as string) : undefined,
    data: parsedData,
    previsaoEntrega: parsedPrevisao,
    compradorResponsavel: body.compradorResponsavel !== undefined ? body.compradorResponsavel || null : undefined,
    formaPagamento: body.formaPagamento !== undefined ? body.formaPagamento || null : undefined,
    dataVencimento: parsedVencimento,
    desconto: body.desconto !== undefined ? Number(body.desconto) || 0 : undefined,
    frete: body.frete !== undefined ? Number(body.frete) || 0 : undefined,
  };

  const purchase =
    itemsToUpdate.length > 0
      ? await prisma.$transaction(async (tx) => {
          await Promise.all(
            itemsToUpdate.map((it) =>
              tx.purchaseItem.update({
                where: { id: it.id },
                data: { quantidade: it.quantidade, valorUnitario: it.valorUnitario, valorTotal: it.valorTotal },
              })
            )
          );
          return tx.purchase.update({
            where: { id },
            data: updateData,
            include: { items: { include: { ingredient: true } }, supplier: true, receiving: true },
          });
        })
      : await prisma.purchase.update({
          where: { id },
          data: updateData,
          include: { items: { include: { ingredient: true } }, supplier: true, receiving: true },
        });

  if (wantsItemsEdit || wantsHeaderEdit) {
    await logPurchaseEvent({
      purchaseId: existing.id,
      empresaId: existing.empresaId,
      action: `Pedido editado por ${session.user.name ?? "usuário"}${wantsItemsEdit ? " (itens atualizados)" : ""}`,
      userId: session.user.id,
    });
  }

  return NextResponse.json({ purchase });
}
