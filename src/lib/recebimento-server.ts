import { prisma } from "@/lib/prisma";
import { createNotifications } from "@/lib/notifications";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

// Ver src/lib/rate-limit.ts — ponto de partida (task #320), fácil de ajustar
// depois sem migration. Chave combina IP+token: sem o token, um único IP
// martelando o link de UM pedido específico não estoura o limite de todo
// mundo que usa aquele IP (ex.: rede da loja) contra OUTROS pedidos.
// Compartilhado pelas 4 rotas de API do link público de recebimento
// (iniciar, finalizar, upload, conferir item) E pela página pública
// (src/app/recebimento/[token]/page.tsx, que chama `loadPurchaseByToken`
// direto, sem passar pela rota de API) — cada requisição em qualquer um
// desses 5 pontos consome do MESMO contador (mesma `key`), já que todos
// fazem parte do mesmo fluxo de conferência de um pedido (mesmo raciocínio
// de `checkSatisfactionRateLimit`, em src/lib/satisfaction-server.ts).
// Recebe `Headers` (não `Request`) pra funcionar tanto num Route Handler
// (`req.headers`) quanto num Server Component (`await headers()` de
// `next/headers`).
const RECEBIMENTO_RATE_LIMIT_MAX = 60;
const RECEBIMENTO_RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;

export async function checkRecebimentoRateLimit(headers: Headers, token: string): Promise<boolean> {
  const ip = getClientIp(headers);
  return checkRateLimit(`recebimento:${ip}:${token}`, {
    windowMs: RECEBIMENTO_RATE_LIMIT_WINDOW_MS,
    max: RECEBIMENTO_RATE_LIMIT_MAX,
  });
}

const RECEIVING_INCLUDE = {
  empresa: { select: { name: true, color: true } },
  supplier: { select: { id: true, razaoSocial: true, nomeFantasia: true } },
  responsavelRecebimento: { select: { id: true, name: true } },
  items: {
    include: {
      ingredient: {
        select: {
          id: true,
          name: true,
          unidade: true,
          estoqueAtual: true,
          exigirPeso: true,
          exigirValidade: true,
          exigirTemperatura: true,
          exigirFoto: true,
        },
      },
      receivingItem: true,
    },
  },
  receiving: { include: { items: true } },
} as const;

export async function loadPurchaseByToken(token: string) {
  return prisma.purchase.findUnique({
    where: { recebimentoToken: token },
    include: RECEIVING_INCLUDE,
  });
}

export type PurchaseByToken = NonNullable<Awaited<ReturnType<typeof loadPurchaseByToken>>>;

export function receivingState(purchase: PurchaseByToken | null) {
  if (!purchase) return "invalido" as const;
  if (purchase.status === "CANCELADO") return "cancelado" as const;
  if (purchase.status === "RECEBIDO" || purchase.status === "RECEBIDO_PARCIAL" || purchase.status === "DIVERGENCIA") {
    return "finalizado" as const;
  }
  return "ok" as const;
}

/** Registra um evento na linha do tempo do pedido (histórico auditável), reaproveitando o AuditLog genérico já usado em outros módulos. */
export async function logPurchaseEvent(params: {
  purchaseId: string;
  empresaId: string;
  action: string;
  userId?: string | null;
}) {
  await prisma.auditLog.create({
    data: {
      entityType: "Purchase",
      entityId: params.purchaseId,
      empresaId: params.empresaId,
      userId: params.userId ?? null,
      action: params.action,
    },
  });
}

/**
 * KPIs do dashboard gerencial de Recebimento: volume, % sem divergência, atrasos,
 * divergências em aberto, valor acumulado das divergências, tempo médio de resolução
 * e o fornecedor com mais problemas — tudo calculado a partir de Receiving/ReceivingItem
 * (nada é armazenado à parte; o dashboard é sempre um retrato atual dos dados já registrados).
 */
export async function loadRecebimentoDashboard(empresaIds: string[], since: Date, supplierId?: string) {
  const receivings = await prisma.receiving.findMany({
    where: {
      empresaId: { in: empresaIds },
      dataFim: { gte: since },
      ...(supplierId ? { purchase: { supplierId } } : {}),
    },
    include: {
      purchase: {
        select: {
          id: true,
          previsaoEntrega: true,
          supplier: { select: { id: true, razaoSocial: true, nomeFantasia: true } },
        },
      },
      items: { include: { purchaseItem: { select: { quantidade: true, valorUnitario: true } } } },
    },
  });

  const totalRecebimentos = receivings.length;
  const semDivergencia = receivings.filter(
    (r) => !r.items.some((it) => it.status === "DIVERGENCIA" || it.status === "NAO_RECEBIDO")
  ).length;
  const pctSemDivergencia = totalRecebimentos ? (semDivergencia / totalRecebimentos) * 100 : 0;

  const pedidosAtrasados = receivings.filter(
    (r) => r.purchase.previsaoEntrega && r.dataFim && r.dataFim > r.purchase.previsaoEntrega
  ).length;

  const divergentes = receivings.flatMap((r) =>
    r.items
      .filter((it) => it.status === "DIVERGENCIA" || it.status === "NAO_RECEBIDO")
      .map((it) => ({ ...it, supplier: r.purchase.supplier }))
  );

  const divergenciasAbertas = divergentes.filter((it) => it.resolucaoTipo === "AGUARDANDO").length;

  const valorDivergencias = divergentes.reduce((sum, it) => {
    const precoRef = it.precoInformado ?? it.purchaseItem.valorUnitario;
    const qtdDif = (it.quantidadeRecebida ?? 0) - it.purchaseItem.quantidade;
    return sum + Math.abs(qtdDif) * precoRef;
  }, 0);

  const resolvidos = divergentes.filter((it) => it.resolvidoEm);
  const tempoMedioResolucaoDias = resolvidos.length
    ? resolvidos.reduce((sum, it) => sum + (it.resolvidoEm!.getTime() - it.createdAt.getTime()) / 86400000, 0) / resolvidos.length
    : null;

  const porFornecedor = new Map<string, { nome: string; count: number }>();
  for (const it of divergentes) {
    const nome = it.supplier.nomeFantasia ?? it.supplier.razaoSocial;
    const entry = porFornecedor.get(it.supplier.id) ?? { nome, count: 0 };
    entry.count += 1;
    porFornecedor.set(it.supplier.id, entry);
  }
  const fornecedorMaisProblemas = [...porFornecedor.values()].sort((a, b) => b.count - a.count)[0] ?? null;

  return {
    totalRecebimentos,
    pctSemDivergencia,
    pedidosAtrasados,
    divergenciasAbertas,
    valorDivergencias,
    tempoMedioResolucaoDias,
    fornecedorMaisProblemas,
  };
}

/**
 * Histórico de recebimento de um fornecedor: taxa de conformidade, valor de divergências
 * acumulado e atraso médio — complementa a `avaliacao` manual do fornecedor com dados reais.
 */
export async function loadSupplierReceivingHistory(supplierId: string) {
  const receivings = await prisma.receiving.findMany({
    where: { purchase: { supplierId } },
    include: {
      purchase: { select: { previsaoEntrega: true } },
      items: { include: { purchaseItem: { select: { quantidade: true, valorUnitario: true } } } },
    },
  });

  const totalRecebimentos = receivings.length;
  const comDivergencia = receivings.filter((r) =>
    r.items.some((it) => it.status === "DIVERGENCIA" || it.status === "NAO_RECEBIDO")
  ).length;
  const taxaConformidade = totalRecebimentos ? ((totalRecebimentos - comDivergencia) / totalRecebimentos) * 100 : null;

  const valorDivergencias = receivings
    .flatMap((r) => r.items.filter((it) => it.status === "DIVERGENCIA" || it.status === "NAO_RECEBIDO"))
    .reduce((sum, it) => {
      const precoRef = it.precoInformado ?? it.purchaseItem.valorUnitario;
      const qtdDif = (it.quantidadeRecebida ?? 0) - it.purchaseItem.quantidade;
      return sum + Math.abs(qtdDif) * precoRef;
    }, 0);

  const atrasos = receivings.filter((r) => r.purchase.previsaoEntrega && r.dataFim && r.dataFim > r.purchase.previsaoEntrega).length;
  const taxaAtraso = totalRecebimentos ? (atrasos / totalRecebimentos) * 100 : null;

  return { totalRecebimentos, taxaConformidade, valorDivergencias, taxaAtraso };
}

export type GastoPorInsumoRow = {
  ingredientId: string;
  ingredientName: string;
  unidade: string;
  quantidadeRecebida: number;
  valorGasto: number;
  precoMedioPonderado: number;
};

/**
 * Gasto por insumo no período: quanto foi de fato recebido — e pago — de cada insumo, pra
 * entender quanto está sendo gasto com cada um ao longo do mês.
 *
 * Regras importantes:
 * - Só entram compras já CONFIRMADAS como recebidas (`Purchase.status` RECEBIDO ou
 *   RECEBIDO_PARCIAL). Nunca PEDIDO_REALIZADO/AGUARDANDO_ENTREGA/EM_CONFERENCIA (ainda não
 *   chegou) nem CANCELADO. E nunca DIVERGENCIA (nem as recusadas, que também viram
 *   DIVERGENCIA) — atenção: isso é por COMPRA inteira, não por item. Uma compra com só 1 item
 *   em divergência entre vários fica de fora do relatório INTEIRA (os itens conformes dela
 *   juntos) até a divergência ser resolvida — resolver uma divergência (central de
 *   divergências) não muda `Purchase.status`, então uma compra que já foi meio "DIVERGENCIA"
 *   fica fora do relatório pra sempre, mesmo depois de resolvida. Decisão deliberada (não é bug
 *   desta função): enquanto há divergência em aberto, os números dessa compra ainda não são
 *   tratados como "gasto final".
 * - Filtra pela data do RECEBIMENTO (`Receiving.dataHora`), não da compra (`Purchase.data`) —
 *   é quando o gasto "aconteceu de verdade" pro caixa da empresa.
 * - Também exclui `Receiving.status === "AGUARDANDO_SOLUCAO"`, mesmo quando `Purchase.status`
 *   já está em RECEBIDO/RECEBIDO_PARCIAL — isso é uma rede de segurança pra um comportamento
 *   PRÉ-EXISTENTE de `POST /api/estoque/recebimento` (achado do Teulis na revisão, não desta
 *   função): o dropdown "Aguardando solução" da tela de conferência corretamente NÃO gera
 *   `StockMovement` (nada entra no estoque), mas erradamente deixa `Purchase.status` virar
 *   "RECEBIDO" do mesmo jeito que um recebimento limpo (só "Recusado" mapeia certo pra
 *   DIVERGENCIA) — sem este filtro extra, o relatório contaria o valor inteiro (via fallback
 *   pra quantidade pedida, já que `quantidadeRecebida` também fica `null` nesse caso) de um
 *   recebimento que na prática não confirmou nada. Corrigir o mapeamento de status em si fica de
 *   fora do escopo desta tarefa (pode ter outra dependência fora do relatório) — só o relatório
 *   é protegido aqui.
 * - Quantidade usada por item é `PurchaseItem.quantidadeRecebida` (a que REALMENTE chegou,
 *   gravada na confirmação do recebimento — ver `POST /api/estoque/recebimento` e `POST
 *   /api/estoque/recebimento/responder/[token]/finalizar`, os dois fluxos que confirmam um
 *   recebimento). Só cai para `quantidade` (a PEDIDA) como fallback quando `quantidadeRecebida`
 *   está `null` — compras recebidas ANTES deste campo existir, que não têm como ser
 *   reconstruídas retroativamente (gap conhecido do histórico antigo, não um bug).
 * - Valor gasto de cada item = quantidade (recebida, ou pedida como fallback) × `valorUnitario`
 *   do PEDIDO — nunca `PurchaseItem.valorTotal` direto, que reflete o valor do PEDIDO original e
 *   fica errado sempre que o recebimento foi parcial (quantidade menor que a pedida).
 * - Isolado por `empresaId` (suporta Grupo Nord — mais de uma empresaId agregada junto, mesmo
 *   padrão de `computeItensVendidosRows` em src/lib/faturamento-analytics.ts).
 * - Ordenado por valor gasto desc (insumo que mais pesou no bolso primeiro).
 */
export async function computeGastoPorInsumoRows(empresaIds: string[], from: Date, to: Date): Promise<GastoPorInsumoRow[]> {
  if (empresaIds.length === 0) return [];

  const receivings = await prisma.receiving.findMany({
    where: {
      empresaId: { in: empresaIds },
      dataHora: { gte: from, lte: to },
      status: { not: "AGUARDANDO_SOLUCAO" },
      purchase: { status: { in: ["RECEBIDO", "RECEBIDO_PARCIAL"] } },
    },
    select: {
      purchase: {
        select: {
          items: {
            select: {
              ingredientId: true,
              quantidade: true,
              quantidadeRecebida: true,
              valorUnitario: true,
              ingredient: { select: { name: true, unidade: true } },
            },
          },
        },
      },
    },
  });

  const byIngredient = new Map<string, { nome: string; unidade: string; quantidade: number; valor: number }>();
  for (const { purchase } of receivings) {
    for (const item of purchase.items) {
      const quantidade = item.quantidadeRecebida ?? item.quantidade;
      const valor = quantidade * item.valorUnitario;
      const cur = byIngredient.get(item.ingredientId) ?? {
        nome: item.ingredient.name,
        unidade: item.ingredient.unidade,
        quantidade: 0,
        valor: 0,
      };
      cur.quantidade += quantidade;
      cur.valor += valor;
      byIngredient.set(item.ingredientId, cur);
    }
  }

  return [...byIngredient.entries()]
    .map(([ingredientId, r]) => ({
      ingredientId,
      ingredientName: r.nome,
      unidade: r.unidade,
      quantidadeRecebida: r.quantidade,
      valorGasto: r.valor,
      precoMedioPonderado: r.quantidade > 0 ? r.valor / r.quantidade : 0,
    }))
    .sort((a, b) => b.valorGasto - a.valorGasto);
}

/** ADMINISTRADOR/GESTOR (globais) + GERENTE com acesso a essa empresa — mesmo critério usado no escalonamento do Checklist. */
async function loadManagers(empresaId: string) {
  return prisma.user.findMany({
    where: {
      active: true,
      OR: [
        { role: { in: ["ADMINISTRADOR", "GESTOR"] } },
        { role: "GERENTE", empresaAccess: { some: { empresaId } } },
      ],
    },
    select: { id: true },
  });
}

/**
 * Notifica gerente(s) da loja + quem criou o pedido (comprador responsável) quando um
 * recebimento é finalizado com divergência. Uma Notification por destinatário, sem duplicar.
 *
 * `resumo.divergencias`/`impactoFinanceiro` só existem na conferência item a item (link público
 * de recebimento, `POST .../responder/[token]/finalizar` — sabe exatamente quantos produtos
 * divergiram e o valor da nota informado para comparar com o valor do pedido). O registro direto
 * de recebimento (tela interna, `POST /api/estoque/recebimento`) marca só o(s) tipo(s) de
 * divergência do pedido inteiro, sem granularidade por produto nem valor de nota para comparar —
 * nesse caso passe `null` nesses dois campos e use `tipos` (rótulos já traduzidos) para a
 * mensagem ainda dizer qual foi o problema, em vez de inventar um número que a rota não tem
 * como saber.
 */
export async function notifyReceivingDivergence(
  purchase: {
    id: string;
    empresaId: string;
    createdById: string;
    supplier: { razaoSocial: string; nomeFantasia: string | null };
  },
  resumo: { totalItens: number; divergencias: number | null; impactoFinanceiro: number | null; tipos?: string[] }
) {
  const managers = await loadManagers(purchase.empresaId);
  const recipientIds = [...new Set([purchase.createdById, ...managers.map((m) => m.id)])];
  if (recipientIds.length === 0) return;

  const supplierName = purchase.supplier.nomeFantasia ?? purchase.supplier.razaoSocial;
  const numero = purchase.id.slice(-5).toUpperCase();
  const title = "Divergência no recebimento";
  const detalhe =
    resumo.divergencias != null
      ? `${resumo.divergencias} de ${resumo.totalItens} produto(s) com divergência`
      : resumo.tipos && resumo.tipos.length > 0
        ? `recebido com divergência (${resumo.tipos.join(", ")})`
        : `recebido com divergência`;
  const impacto =
    resumo.impactoFinanceiro != null
      ? ` Impacto financeiro estimado: ${resumo.impactoFinanceiro >= 0 ? "+" : ""}${resumo.impactoFinanceiro.toFixed(2)}.`
      : "";
  const body = `Pedido #${numero} — ${supplierName}: ${detalhe}.${impacto}`;

  await createNotifications(
    recipientIds.map((userId) => ({
      userId,
      type: "RECEBIMENTO_DIVERGENCIA",
      title,
      body,
      priority: "ATENCAO",
      purchaseId: purchase.id,
      url: "/portal/estoque/recebimento",
    }))
  );
}

/**
 * Par de `notifyReceivingDivergence` para o caso "sem problema": notifica gerente(s) da loja +
 * quem criou o pedido quando um recebimento é finalizado sem nenhuma divergência. Mesmo critério
 * de destinatários e mesmo padrão "uma Notification por destinatário, sem duplicar".
 */
export async function notifyReceivingCompleted(
  purchase: {
    id: string;
    empresaId: string;
    createdById: string;
    supplier: { razaoSocial: string; nomeFantasia: string | null };
  },
  resumo: { totalItens: number }
) {
  const managers = await loadManagers(purchase.empresaId);
  const recipientIds = [...new Set([purchase.createdById, ...managers.map((m) => m.id)])];
  if (recipientIds.length === 0) return;

  const supplierName = purchase.supplier.nomeFantasia ?? purchase.supplier.razaoSocial;
  const numero = purchase.id.slice(-5).toUpperCase();
  const title = "Recebimento concluído";
  const body = `Pedido #${numero} — ${supplierName}: recebido sem divergências (${resumo.totalItens} produto(s) conferido(s)).`;

  await createNotifications(
    recipientIds.map((userId) => ({
      userId,
      type: "RECEBIMENTO_CONCLUIDO",
      title,
      body,
      priority: "INFORMACAO",
      purchaseId: purchase.id,
      url: "/portal/estoque/recebimento",
    }))
  );
}
