/** Nomes legíveis para a "forma" do lançamento que o banco informa (operationType). */
const LABELS: Record<string, string> = {
  PIX: "PIX",
  BOLETO: "Boleto",
  TED: "TED",
  DOC: "DOC",
  CARTAO: "Cartão",
  OUTROS: "Outros",
  TRANSFERENCIA_MESMA_INSTITUICAO: "Transferência (mesmo banco)",
  RESGATE_APLIC_FINANCEIRA: "Resgate de aplicação",
  APLICACAO_FINANCEIRA: "Aplicação financeira",
  TARIFA_SERVICOS_AVULSOS: "Tarifa",
  TARIFA: "Tarifa",
  SAQUE: "Saque",
  DEPOSITO: "Depósito",
};

export function paymentMethodLabel(code: string | null | undefined): string | null {
  if (!code) return null;
  const key = code.trim().toUpperCase();
  if (LABELS[key]) return LABELS[key];
  // Desconhecido: "NOVA_FORMA_X" -> "Nova forma x" (melhor que o código cru, sem inventar significado).
  const text = key.replace(/_/g, " ").toLowerCase();
  return text.charAt(0).toUpperCase() + text.slice(1);
}
