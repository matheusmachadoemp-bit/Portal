export type HistoricoItem = {
  id: string;
  pedido: string;
  cliente: string;
  totalPacotes: number;
  observacoes: string;
  horario: string;
};

const CHAVE = "portal-etiquetas-historico";
const LIMITE = 10;

export function carregarHistorico(): HistoricoItem[] {
  if (typeof window === "undefined") return [];
  try {
    const bruto = window.localStorage.getItem(CHAVE);
    if (!bruto) return [];
    const dados = JSON.parse(bruto);
    return Array.isArray(dados) ? dados : [];
  } catch {
    return [];
  }
}

export function registrarHistorico(
  entrada: Omit<HistoricoItem, "id" | "horario">
): HistoricoItem[] {
  const atual = carregarHistorico();
  const semDuplicata = atual.filter(
    (item) => !(item.pedido === entrada.pedido && item.cliente === entrada.cliente)
  );
  const novo: HistoricoItem = {
    ...entrada,
    id: `${entrada.pedido}-${Date.now()}`,
    horario: new Date().toISOString(),
  };
  const lista = [novo, ...semDuplicata].slice(0, LIMITE);
  window.localStorage.setItem(CHAVE, JSON.stringify(lista));
  return lista;
}

export function formatarHorario(iso: string): string {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}
