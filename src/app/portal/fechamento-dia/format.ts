import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

// Helpers de exibição (puros, sem acesso a banco) compartilhados pelas duas
// telas do módulo Fechamento do Dia — status do dia e formulário do cargo.

/**
 * "Sábado, 12/09/2026" a partir de uma data-chave "YYYY-MM-DD" (o mesmo
 * formato que a rota GET /api/fechamento-dia/status devolve em `date`, via
 * `spDateKey` em src/lib/checklist.ts).
 *
 * Construído com o construtor (ano, mês, dia) em vez de `new Date(dateKey)`
 * de propósito: uma string "YYYY-MM-DD" pura é interpretada pelo `Date` como
 * meia-noite UTC, o que viraria o dia anterior ao formatar num fuso atrás de
 * UTC (caso do Brasil) — aqui só queremos o calendário local do navegador.
 */
export function formatDiaExtenso(dateKey: string): string {
  const [ano, mes, dia] = dateKey.split("-").map(Number);
  const data = new Date(ano, (mes || 1) - 1, dia || 1);
  const texto = format(data, "EEEE, dd/MM/yyyy", { locale: ptBR });
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

/** "21:40" a partir de um instante ISO, sempre no fuso de São Paulo. */
export function formatHora(iso: string): string {
  return new Date(iso).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  });
}

export type FechamentoStatusValor = "PENDENTE" | "ENVIADO" | "ATRASADO";

export const FECHAMENTO_STATUS_LABEL: Record<FechamentoStatusValor, string> = {
  ENVIADO: "Enviado",
  PENDENTE: "Pendente",
  ATRASADO: "Atrasado",
};

export const FECHAMENTO_STATUS_TONE: Record<FechamentoStatusValor, "success" | "warning" | "danger"> = {
  ENVIADO: "success",
  PENDENTE: "warning",
  ATRASADO: "danger",
};
