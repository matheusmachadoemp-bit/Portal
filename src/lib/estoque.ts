import type { Prisma } from "@prisma/client";

export const STOCK_MOVEMENT_TYPES = ["ENTRADA", "SAIDA", "AJUSTE", "PERDA", "TRANSFERENCIA", "INVENTARIO"] as const;
export type StockMovementTypeKey = (typeof STOCK_MOVEMENT_TYPES)[number];

export const STOCK_MOVEMENT_LABEL: Record<StockMovementTypeKey, string> = {
  ENTRADA: "Entrada",
  SAIDA: "Saída",
  AJUSTE: "Ajuste",
  PERDA: "Perda",
  TRANSFERENCIA: "Transferência",
  INVENTARIO: "Inventário",
};

export const STOCK_MOVEMENT_TONE: Record<StockMovementTypeKey, "default" | "success" | "warning" | "danger" | "info"> = {
  ENTRADA: "success",
  SAIDA: "info",
  AJUSTE: "default",
  PERDA: "danger",
  TRANSFERENCIA: "warning",
  INVENTARIO: "default",
};

/** Ajuste e Inventário definem o estoque para um valor absoluto (contagem física); os demais tipos são deltas. */
export function isAbsoluteMovement(type: string): boolean {
  return type === "AJUSTE" || type === "INVENTARIO";
}

export function applyMovement(currentStock: number, type: string, quantidade: number): number {
  if (isAbsoluteMovement(type)) return quantidade;
  if (type === "ENTRADA") return currentStock + quantidade;
  return currentStock - quantidade;
}

/**
 * Opções de `prisma.$transaction(async (tx) => {...}, ESTOQUE_TX_OPTIONS)` para as transações
 * interativas desta tarefa (achado de auditoria, 2026-11) que gravam movimentação de estoque —
 * `lockIngredientStock` (abaixo) e os blocos que usam `increment`/`decrement` + o valor retornado
 * (ver comentário da função). Mesma convenção já usada pra outras transações que esperam uma
 * trava de linha/advisory lock de outra chamada (`src/lib/ficha-autolink.ts`,
 * `src/lib/ficha-nome-server.ts`, `src/lib/bank-sync-server.ts`,
 * `src/lib/bank-reconciliation.ts`): o padrão do Prisma (2s de espera pra começar / 5s de duração
 * total) é apertado demais pra isso — além da hibernação do Neon (banco de produção), agora
 * `lockIngredientStock` BLOQUEIA de propósito quando duas chamadas concorrentes atingem o mesmo
 * insumo (é o próprio mecanismo da correção), então, sob um insumo bem movimentado, uma chamada
 * esperando a vez da outra pode facilmente passar dos 5s padrão e falhar com erro de transação em
 * vez de aplicar o movimento — não é mais o lost update silencioso de antes, mas é um risco de
 * disponibilidade novo que esse `timeout`/`maxWait` maior evita.
 */
export const ESTOQUE_TX_OPTIONS = { maxWait: 10_000, timeout: 15_000 };

/**
 * Trava a linha do insumo (`SELECT ... FOR UPDATE`) até o fim da transação e devolve o
 * `estoqueAtual` MAIS RECENTE — não o que o chamador leu antes de abrir a transação.
 *
 * Correção da condição de corrida (lost update) encontrada em
 * `POST /api/estoque/movimentos` e `POST /api/estoque/perdas`: as duas rotas liam
 * `ingredient.estoqueAtual` ANTES da transação, calculavam `estoqueApos` em JS, e gravavam
 * `Ingredient.estoqueAtual` como valor ABSOLUTO dentro de um `$transaction([...])` em lote, que
 * não relia o valor dentro da transação. Duas chamadas concorrentes para o MESMO insumo partiam
 * do mesmo valor-base e a que grava por último sobrescrevia a outra silenciosamente (ex.: estoque
 * 100 + duas entradas concorrentes de +10 e +5 virava 105 em vez de 115 — reproduzido e corrigido
 * em 2026-11).
 *
 * Toda rota que precisa calcular um `estoqueApos` novo a partir do estoque atual — e o tipo de
 * movimento não permite um `increment`/`decrement` atômico simples (ex.: AJUSTE/INVENTARIO, que
 * definem um valor ABSOLUTO por natureza, não um delta) — deve chamar esta função DENTRO de uma
 * transação interativa (`prisma.$transaction(async (tx) => {...})`), usando o valor retornado
 * (não um valor lido antes de abrir a transação) para calcular `estoqueApos` e para o
 * `tx.ingredient.update(...)` que grava o novo saldo. O lock da linha é liberado só quando a
 * transação commita/aborta, então uma segunda chamada concorrente para o mesmo insumo espera
 * aqui até a primeira terminar, e então lê o valor já atualizado — sem lost update.
 *
 * Quando o movimento é um delta simples (ENTRADA/SAIDA/TRANSFERENCIA/PERDA), prefira
 * `tx.ingredient.update({ data: { estoqueAtual: { increment/decrement: delta } } })` direto (sem
 * chamar esta função): o UPDATE atômico do Postgres já evita o lost update sem precisar de lock
 * explícito, e o próprio retorno do `update` já traz o `estoqueAtual` resultante pra gravar no
 * `StockMovement.estoqueApos` do histórico — ver `POST /api/estoque/compras/[id]`,
 * `POST /api/estoque/recebimento` e `.../recebimento/responder/[token]/finalizar`.
 */
export async function lockIngredientStock(tx: Prisma.TransactionClient, ingredientId: string): Promise<number> {
  const rows = await tx.$queryRaw<{ estoqueAtual: number }[]>`
    SELECT "estoqueAtual" FROM "Ingredient" WHERE "id" = ${ingredientId} FOR UPDATE
  `;
  if (rows.length === 0) throw new Error("Insumo não encontrado.");
  return rows[0].estoqueAtual;
}

/**
 * Custo de 1 unidade de `Ingredient.unidade` (kg, l, un...) — função central usada por TODO
 * cálculo de custo do sistema (Ficha Técnica/CMV via `@/lib/ficha`, valorização de estoque,
 * contagens, perdas). Até a correção abaixo (achado de produção, revisão de 02/10/2026, loja
 * Zarki Sushi — "Combo Salmão 20 peças" aparecia com custo de R$ 22,76 em vez de ≈ R$ 44,32),
 * dividia `precoAtual` por `quantidadeEmbalagem`, tratando `precoAtual` como "preço da embalagem
 * inteira comprada" — mas `precoAtual` NÃO é isso: é mantido pelo resto do sistema como preço de
 * 1 unidade de `unidade` (mesma unidade de `estoqueAtual`), não da embalagem. Prova, nos dois
 * únicos lugares que escrevem `precoAtual` automaticamente a partir de uma compra de verdade:
 * `POST /api/estoque/recebimento` e `.../recebimento/responder/[token]/finalizar/route.ts` fazem
 * `precoAtual: item.valorUnitario` direto, sem dividir por nada, e `PurchaseItem.valorUnitario` é
 * inequivocamente "preço por 1 `unidade`" (`valorTotal = quantidade(na unidade) × valorUnitario`,
 * ex.: 25kg de Arroz a R$12 = R$300, ou seja R$12/kg — não R$12 pela embalagem de 5kg que
 * `quantidadeEmbalagem` registra). `src/lib/producao-indicadores-server.ts` também usa
 * `ingredient.precoAtual` direto como "preço por unidade" sem dividir por nada. A divisão por
 * `quantidadeEmbalagem` deflacionava o custo de qualquer insumo com embalagem > 1 (ex.: Nori:
 * embalagem de 50un fazia o sistema achar que cada folha custava R$1,80/50 = R$0,036, quando o
 * preço de 1 folha já é R$1,80) — silenciosamente "escondendo" a maior parte do custo de qualquer
 * ficha técnica com insumo comprado em pacote/caixa/saco. `quantidadeEmbalagem` continua existindo
 * no cadastro do insumo (tamanho de embalagem típica, usado em telas de compra/recebimento), só
 * não entra mais nesta conta — não remova a divisão de volta sem reconferir essa prova.
 */
export function ingredientCostPerUnit(ingredient: { precoAtual: number }): number {
  return ingredient.precoAtual;
}

// ---------------------------------------------------------------------------
// Setores (locais de contagem/armazenamento) — usados nas telas de Contagem,
// Produtos e Categorias. Antes um array hardcoded aqui (`SECTORS`), agora uma
// tabela editável (`StockSector`, ver schema.prisma) consumida via
// `GET /api/estoque/setores` e repassada por prop a partir de cada `page.tsx`
// (contagem, produtos, perdas) — não existe mais uma constante local.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Compras
// ---------------------------------------------------------------------------

export const PURCHASE_STATUS = ["PEDIDO_REALIZADO", "AGUARDANDO_ENTREGA", "EM_CONFERENCIA", "RECEBIDO_PARCIAL", "RECEBIDO", "DIVERGENCIA", "CANCELADO"] as const;

export const PURCHASE_STATUS_LABEL: Record<string, string> = {
  PEDIDO_REALIZADO: "Pedido realizado",
  AGUARDANDO_ENTREGA: "Aguardando entrega",
  EM_CONFERENCIA: "Em conferência",
  RECEBIDO_PARCIAL: "Recebido parcialmente",
  RECEBIDO: "Recebido",
  DIVERGENCIA: "Divergência",
  CANCELADO: "Cancelado",
};

export const PURCHASE_STATUS_TONE: Record<string, "default" | "success" | "warning" | "danger" | "info"> = {
  PEDIDO_REALIZADO: "info",
  AGUARDANDO_ENTREGA: "warning",
  EM_CONFERENCIA: "info",
  RECEBIDO_PARCIAL: "warning",
  RECEBIDO: "success",
  DIVERGENCIA: "danger",
  CANCELADO: "default",
};

/**
 * Formas de pagamento válidas para "pagar um fornecedor" (compras e Contas a Pagar) — mesma
 * lista usada em Financeiro > Contas a Pagar (contas-pagar-client.tsx), diferente de
 * `SALE_PAYMENT_METHODS` (`@/lib/vendas-analytics`, como o CLIENTE pagou a loja), que traz
 * Voucher/Pago Online/Fiado, sem sentido para pagamento a fornecedor. Usada tanto pela tela de
 * edição de compra (compras-client.tsx) quanto pelo validador de `formaPagamento` do PATCH
 * (`/api/estoque/compras/[id]`) — achado do Teulis, 2026-10: o PATCH validava contra
 * `PAYMENT_METHOD_LABEL` (a lista CHEIA compartilhada com Vendas) em vez desta lista curada que a
 * própria tela já restringe, permitindo em tese salvar Voucher/Fiado/Pago Online numa compra.
 *
 * Reduzida a 6 opções a pedido do usuário, 2026-10 (pedido original: Pix, Crédito, Débito,
 * Mumbuca, Boleto, Dinheiro — ordem do array usada pelo `.map()` das telas pra renderizar o
 * `<select>`). MUMBUCA é moeda social/digital real (usada em Maricá-RJ, onde uma das lojas
 * aceita/paga com ela — já existe "Conta Mumbuca - Nord" cadastrada como conta bancária), não um
 * erro de digitação. TED/DOC/TRANSFERENCIA/CHEQUE/OUTRO saíram da lista de opções NOVAS, mas
 * continuam em `PAYMENT_METHOD_LABEL` (`@/lib/vendas-analytics`) pra não quebrar lançamentos
 * antigos que já tenham um desses valores salvos — ver tratamento de "valor legado" em
 * `compras-client.tsx`, `contas-pagar-client.tsx` e no validador do PATCH de compras.
 */
export const PURCHASE_PAYMENT_METHODS = ["PIX", "CARTAO_CREDITO", "CARTAO_DEBITO", "MUMBUCA", "BOLETO", "DINHEIRO"] as const;

// ---------------------------------------------------------------------------
// Recebimento de mercadorias
// ---------------------------------------------------------------------------

export const RECEIVING_STATUS = ["APROVADO", "APROVADO_RESSALVA", "RECEBIDO_PARCIAL", "RECUSADO", "AGUARDANDO_SOLUCAO"] as const;

export const RECEIVING_STATUS_LABEL: Record<string, string> = {
  APROVADO: "Aprovado",
  APROVADO_RESSALVA: "Aprovado com ressalva",
  RECEBIDO_PARCIAL: "Recebido parcialmente",
  RECUSADO: "Recusado",
  AGUARDANDO_SOLUCAO: "Aguardando solução",
};

export const RECEIVING_STATUS_TONE: Record<string, "default" | "success" | "warning" | "danger" | "info"> = {
  APROVADO: "success",
  APROVADO_RESSALVA: "warning",
  RECEBIDO_PARCIAL: "warning",
  RECUSADO: "danger",
  AGUARDANDO_SOLUCAO: "warning",
};

export const RECEIVING_DIVERGENCE_LABEL: Record<string, string> = {
  FALTA: "Falta de produto",
  EXCESSO: "Excesso de produto",
  PESO_INCORRETO: "Peso incorreto",
  PRODUTO_DANIFICADO: "Produto danificado",
  FORA_TEMPERATURA: "Produto fora da temperatura",
  VALIDADE_CURTA: "Validade curta",
  PRODUTO_DIFERENTE: "Produto diferente do pedido",
  PRECO_DIFERENTE: "Preço diferente do negociado",
};

// ---------------------------------------------------------------------------
// Recebimento — conferência item a item (tela mobile)
// ---------------------------------------------------------------------------

export const RECEIVING_ITEM_STATUS_LABEL: Record<string, string> = {
  NAO_CONFERIDO: "Não conferido",
  CONFERIDO: "Conferido",
  DIVERGENCIA: "Divergência",
  NAO_RECEBIDO: "Não recebido",
};

export const RECEIVING_ITEM_STATUS_TONE: Record<string, "default" | "success" | "warning" | "danger" | "info"> = {
  NAO_CONFERIDO: "default",
  CONFERIDO: "success",
  DIVERGENCIA: "danger",
  NAO_RECEBIDO: "danger",
};

export const RECEIVING_ITEM_DIVERGENCE_LABEL: Record<string, string> = {
  QUANTIDADE_MENOR: "Quantidade menor",
  QUANTIDADE_MAIOR: "Quantidade maior",
  PRODUTO_NAO_ENTREGUE: "Produto não entregue",
  PRODUTO_DIFERENTE: "Produto diferente",
  PRECO_DIFERENTE: "Preço diferente",
  PRODUTO_AVARIADO: "Produto avariado",
  EMBALAGEM_VIOLADA: "Embalagem violada",
  VALIDADE_INADEQUADA: "Validade inadequada",
  TEMPERATURA_INADEQUADA: "Temperatura inadequada",
  QUALIDADE_FORA_PADRAO: "Qualidade fora do padrão",
  OUTRO: "Outro",
};

/** Divergências que exigem foto como comprovação obrigatória. */
export const RECEIVING_ITEM_DIVERGENCE_REQUIRES_PHOTO = new Set([
  "PRODUTO_AVARIADO",
  "EMBALAGEM_VIOLADA",
  "VALIDADE_INADEQUADA",
  "TEMPERATURA_INADEQUADA",
  "QUALIDADE_FORA_PADRAO",
]);

export const RECEIVING_ITEM_RESOLUTION_LABEL: Record<string, string> = {
  AGUARDANDO: "Aguardando solução",
  FORNECEDOR_REPOSICAO: "Fornecedor fará reposição",
  FORNECEDOR_CREDITO: "Fornecedor dará crédito",
  PRODUTO_DEVOLVIDO: "Produto devolvido",
  DIFERENCA_ACEITA: "Diferença aceita",
  OUTRA: "Outra solução",
};

export const RECEIVING_ITEM_RESOLUTION_TONE: Record<string, "default" | "success" | "warning" | "danger" | "info"> = {
  AGUARDANDO: "warning",
  FORNECEDOR_REPOSICAO: "info",
  FORNECEDOR_CREDITO: "info",
  PRODUTO_DEVOLVIDO: "success",
  DIFERENCA_ACEITA: "success",
  OUTRA: "success",
};

/** Quem pode criar pedidos de compra e resolver divergências de recebimento — decisões com impacto financeiro, não abertas a qualquer colaborador. */
export const RECEBIMENTO_MANAGE_ROLES = ["ADMINISTRADOR", "GESTOR", "GERENTE", "SUPERVISOR"];

// ---------------------------------------------------------------------------
// Transferências entre lojas
// ---------------------------------------------------------------------------

export const TRANSFER_STATUS = ["SOLICITADA", "SEPARACAO", "ENVIADA", "RECEBIDA", "DIVERGENCIA"] as const;
export type TransferStatusValue = (typeof TRANSFER_STATUS)[number];

export const TRANSFER_STATUS_LABEL: Record<string, string> = {
  SOLICITADA: "Solicitada",
  SEPARACAO: "Em separação",
  ENVIADA: "Enviada",
  RECEBIDA: "Recebida",
  DIVERGENCIA: "Divergência",
};

export const TRANSFER_STATUS_TONE: Record<string, "default" | "success" | "warning" | "danger" | "info"> = {
  SOLICITADA: "default",
  SEPARACAO: "info",
  ENVIADA: "warning",
  RECEBIDA: "success",
  DIVERGENCIA: "danger",
};

// ---------------------------------------------------------------------------
// Perdas e desperdícios
// ---------------------------------------------------------------------------

export const LOSS_REASONS = [
  "VENCIMENTO",
  "ERRO_PRODUCAO",
  "QUEIMA",
  "QUEDA",
  "CONTAMINACAO",
  "ARMAZENAMENTO_INCORRETO",
  "PORCIONAMENTO_INCORRETO",
  "DEVOLUCAO_CLIENTE",
  "SOBRA_PRODUCAO",
  "PERDA_LIMPEZA",
  "PRODUTO_DANIFICADO",
  "FURTO",
  "OUTRO",
] as const;

export const LOSS_REASON_LABEL: Record<string, string> = {
  VENCIMENTO: "Vencimento",
  ERRO_PRODUCAO: "Erro de produção",
  QUEIMA: "Queima",
  QUEDA: "Queda",
  CONTAMINACAO: "Contaminação",
  ARMAZENAMENTO_INCORRETO: "Armazenamento incorreto",
  PORCIONAMENTO_INCORRETO: "Porcionamento incorreto",
  DEVOLUCAO_CLIENTE: "Devolução de cliente",
  SOBRA_PRODUCAO: "Sobra de produção",
  PERDA_LIMPEZA: "Perda de limpeza",
  PRODUTO_DANIFICADO: "Produto danificado",
  FURTO: "Furto ou desaparecimento",
  OUTRO: "Outro",
};

// ---------------------------------------------------------------------------
// Contagens (semanal e mensal)
// ---------------------------------------------------------------------------

export const COUNT_STATUS_LABEL: Record<string, string> = {
  RASCUNHO: "Rascunho",
  EM_ANDAMENTO: "Em andamento",
  CONCLUIDA: "Concluída",
  APROVADA: "Aprovada",
  REABERTA: "Reaberta",
};

export const COUNT_STATUS_TONE: Record<string, "default" | "success" | "warning" | "danger" | "info"> = {
  RASCUNHO: "default",
  EM_ANDAMENTO: "info",
  CONCLUIDA: "warning",
  APROVADA: "success",
  REABERTA: "danger",
};

export const COUNT_ITEM_STATUS_LABEL: Record<string, string> = {
  PENDENTE: "Pendente",
  CONTADO: "Contado",
  CONFERIDO: "Conferido",
  DIVERGENCIA: "Divergência",
  RECONTAGEM: "Recontagem solicitada",
  APROVADO: "Aprovado",
};

export const COUNT_ITEM_STATUS_TONE: Record<string, "default" | "success" | "warning" | "danger" | "info"> = {
  PENDENTE: "default",
  CONTADO: "info",
  CONFERIDO: "info",
  DIVERGENCIA: "danger",
  RECONTAGEM: "warning",
  APROVADO: "success",
};

export const MONTHLY_COUNT_CHECKLIST: { key: string; label: string }[] = [
  { key: "setoresContados", label: "Todos os setores foram contados" },
  { key: "comprasLancadas", label: "Todas as compras foram lançadas" },
  { key: "notasConferidas", label: "Todas as notas foram conferidas" },
  { key: "transferenciasRegistradas", label: "Transferências foram registradas" },
  { key: "perdasLancadas", label: "Perdas e desperdícios foram lançados" },
  { key: "cortesiasRegistradas", label: "Cortesias foram registradas" },
  { key: "consumoInternoRegistrado", label: "Consumo interno foi registrado" },
  { key: "produtosSemCustoCorrigidos", label: "Produtos sem custo foram corrigidos" },
  { key: "divergenciasJustificadas", label: "Divergências foram justificadas" },
];

// ---------------------------------------------------------------------------
// Plano de ação
// ---------------------------------------------------------------------------

export const ACTION_PLAN_STATUS_LABEL: Record<string, string> = {
  PENDENTE: "Pendente",
  EM_ANDAMENTO: "Em andamento",
  CONCLUIDO: "Concluído",
  ATRASADO: "Atrasado",
};

export const ACTION_PLAN_STATUS_TONE: Record<string, "default" | "success" | "warning" | "danger" | "info"> = {
  PENDENTE: "default",
  EM_ANDAMENTO: "info",
  CONCLUIDO: "success",
  ATRASADO: "danger",
};

export const COMPARATIVO_CAUSAS = [
  "Desperdício sem registro",
  "Porcionamento acima da ficha",
  "Erro de contagem",
  "Compra não lançada",
  "Transferência não registrada",
  "Cortesia não lançada",
  "Consumo interno",
  "Ficha técnica incorreta",
  "Custo de compra desatualizado",
  "Furto ou desaparecimento",
] as const;

// ---------------------------------------------------------------------------
// Lock de linha para leitura+escrita de estoque dentro de transação
// ---------------------------------------------------------------------------

/**
 * Trava (via `SELECT ... FOR UPDATE`) e relê, DENTRO da transação `tx`, o `estoqueAtual` mais
 * recente de cada insumo em `ingredientIds` — nunca o valor que o chamador possa ter lido ANTES
 * de abrir a transação. Toda rota/função que calcula um novo `estoqueAtual` a partir do atual
 * (débito/crédito de transferência, consumo de produção, movimento manual, perda) deve ler o
 * saldo através desta função (ou de uma query equivalente com `FOR UPDATE` dentro da mesma
 * transação), nunca de um `findMany`/`findUnique` comum feito antes da transação nem de um
 * `include` carregado antes — senão duas transações concorrentes tocando o MESMO insumo leem o
 * mesmo valor "antigo", calculam dois resultados diferentes a partir dele, e a segunda grava por
 * cima da primeira sem nunca ver o efeito dela (lost update). Achado real (revisão de QA,
 * 2026-11): transferências concorrentes entre lojas e finalizações de produção concorrentes
 * consumindo o mesmo insumo cru perdiam atualização de estoque silenciosamente por esse motivo.
 *
 * Importante sobre ORDEM: `ingredientIds` é deduplicado e ORDENADO (por id, ordem total e
 * estável) antes de travar, e cada linha é travada com uma consulta `FOR UPDATE` INDIVIDUAL, uma
 * atrás da outra (nunca todas de uma vez num único `WHERE id IN (...)`) — de propósito. Com mais
 * de um insumo envolvido na mesma transação (ex.: uma transferência com vários itens, ou um
 * consumo de produção com várias matérias-primas), se duas transações concorrentes tentassem
 * travar os MESMOS dois insumos em ordens diferentes, poderiam travar uma esperando a outra
 * indefinidamente (deadlock) — o Postgres eventualmente cancela uma das duas, mas depender disso
 * é arriscado. Travar sempre em ordem crescente de id (a mesma ordem, em qualquer chamada, de
 * qualquer rota) elimina essa possibilidade: não existe par de chamadas concorrentes que
 * discordem da ordem relativa de dois ids que ambas tentam travar. E `FOR UPDATE` combinado com
 * `ORDER BY` numa única query de várias linhas NÃO garante essa ordem de aquisição (o Postgres
 * pode travar as linhas na ordem em que o plano de execução as devolve, e só ordenar o resultado
 * depois) — por isso o lock de cada id é uma query separada, sequencial.
 *
 * Devolve um `Map<ingredientId, estoqueAtual>` com todos os ids pedidos — lança `Error` se
 * algum id não existir mais (mesmo comportamento da variante de um único id acima, por
 * consistência: nunca mascara um insumo ausente devolvendo um mapa incompleto em silêncio).
 */
export async function lockIngredientStocks(
  tx: Prisma.TransactionClient,
  ingredientIds: string[]
): Promise<Map<string, number>> {
  const uniqueSortedIds = Array.from(new Set(ingredientIds)).sort();
  const result = new Map<string, number>();
  for (const id of uniqueSortedIds) {
    const rows = await tx.$queryRaw<{ estoqueAtual: number }[]>`
      SELECT "estoqueAtual" FROM "Ingredient" WHERE "id" = ${id} FOR UPDATE
    `;
    if (rows.length === 0) throw new Error("Insumo não encontrado.");
    result.set(id, rows[0].estoqueAtual);
  }
  return result;
}

export function classificarCmv(
  realPercent: number,
  metaPercent: number,
  temDados: boolean
): { label: string; tone: "default" | "success" | "warning" | "danger" | "info" } {
  if (!temDados) return { label: "Dados incompletos", tone: "default" };
  const diff = realPercent - metaPercent;
  if (diff <= 0) return { label: "Dentro da meta", tone: "success" };
  if (diff <= 2) return { label: "Atenção", tone: "warning" };
  if (diff <= 5) return { label: "Acima da meta", tone: "danger" };
  return { label: "Perda elevada", tone: "danger" };
}
