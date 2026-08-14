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

export function ingredientCostPerUnit(ingredient: { precoAtual: number; quantidadeEmbalagem: number }): number {
  if (!ingredient.quantidadeEmbalagem) return 0;
  return ingredient.precoAtual / ingredient.quantidadeEmbalagem;
}

// ---------------------------------------------------------------------------
// Setores (locais de contagem/armazenamento) — usados nas telas de Contagem,
// Produtos e Categorias.
// ---------------------------------------------------------------------------

export const SECTORS = [
  "Sushibar",
  "Cozinha quente",
  "Pizzaria",
  "Chapa",
  "Produção",
  "Câmara fria",
  "Freezer",
  "Estoque seco",
  "Bar e bebidas",
  "Delivery e embalagens",
] as const;

// ---------------------------------------------------------------------------
// Compras
// ---------------------------------------------------------------------------

export const PURCHASE_STATUS = ["PEDIDO_REALIZADO", "AGUARDANDO_ENTREGA", "RECEBIDO_PARCIAL", "RECEBIDO", "DIVERGENCIA", "CANCELADO"] as const;

export const PURCHASE_STATUS_LABEL: Record<string, string> = {
  PEDIDO_REALIZADO: "Pedido realizado",
  AGUARDANDO_ENTREGA: "Aguardando entrega",
  RECEBIDO_PARCIAL: "Recebido parcialmente",
  RECEBIDO: "Recebido",
  DIVERGENCIA: "Divergência",
  CANCELADO: "Cancelado",
};

export const PURCHASE_STATUS_TONE: Record<string, "default" | "success" | "warning" | "danger" | "info"> = {
  PEDIDO_REALIZADO: "info",
  AGUARDANDO_ENTREGA: "warning",
  RECEBIDO_PARCIAL: "warning",
  RECEBIDO: "success",
  DIVERGENCIA: "danger",
  CANCELADO: "default",
};

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
  AGUARDANDO_SOLUCAO: "info",
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
// Transferências entre lojas
// ---------------------------------------------------------------------------

export const TRANSFER_STATUS = ["SOLICITADA", "SEPARACAO", "ENVIADA", "RECEBIDA", "DIVERGENCIA"] as const;

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
