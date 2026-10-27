import { startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, subDays } from "date-fns";
import { parseDateKey, spEndOfDay, spStartOfDay } from "@/lib/timezone";

/**
 * Filtro de vencimento para telas que olham pra frente (contas a pagar/receber) — diferente
 * do padrão de período do portal (Hoje/Ontem/Últimos 7 dias/Este mês/Mês passado/
 * Personalizado, em @/lib/periods), que é sempre voltado pro passado (não faz sentido pra
 * uma lista de contas, onde a maioria dos vencimentos ainda não aconteceu). "Atrasadas" é
 * calculado pela data de vencimento já passada e o status ainda não pago/recebido nem
 * cancelado, e não pelo status ATRASADO em si — esse status não é atualizado automaticamente
 * em lugar nenhum, só se alguém escolher manualmente no formulário.
 */
export type DueDateFilterKey = "" | "atrasadas" | "hoje" | "semana" | "mes" | "personalizado";

export const DUE_DATE_FILTER_OPTIONS: { key: DueDateFilterKey; label: string }[] = [
  { key: "", label: "Todos os vencimentos" },
  { key: "atrasadas", label: "Atrasadas" },
  { key: "hoje", label: "Vence hoje" },
  { key: "semana", label: "Esta semana" },
  { key: "mes", label: "Este mês" },
  { key: "personalizado", label: "Personalizado" },
];

export function matchesDueDateFilter(
  dataVencimento: Date,
  status: string,
  key: DueDateFilterKey,
  custom: { from?: string; to?: string },
  settledStatuses: string[],
  now: Date = new Date()
): boolean {
  switch (key) {
    case "":
      return true;
    case "atrasadas":
      return dataVencimento < startOfDay(now) && !settledStatuses.includes(status);
    case "hoje":
      return dataVencimento >= startOfDay(now) && dataVencimento <= endOfDay(now);
    case "semana":
      return dataVencimento >= startOfWeek(now, { weekStartsOn: 1 }) && dataVencimento <= endOfWeek(now, { weekStartsOn: 1 });
    case "mes":
      return dataVencimento >= startOfMonth(now) && dataVencimento <= endOfMonth(now);
    case "personalizado": {
      // O vencimento é gravado à meia-noite de São Paulo (03:00Z). "AAAA-MM-DD" do campo de data NÃO pode virar
      // new Date(...) (meia-noite UTC = 21h do dia anterior em SP): o intervalo 25 a 25 não achava o dia 25.
      const from = parseDateKey(custom.from);
      const to = parseDateKey(custom.to);
      if (!from || !to) return true;
      return dataVencimento >= spStartOfDay(from) && dataVencimento <= spEndOfDay(to);
    }
    default:
      return true;
  }
}

/**
 * Janela de dias que o carregamento inicial de Contas a Pagar/Receber (Server Component, ver
 * `contas-a-pagar/page.tsx` e `contas-a-receber/page.tsx`) e o `refresh()` dos respectivos clients
 * usam para buscar no backend (`GET /api/financeiro/pagar|receber?from=...`). NÃO É o mesmo
 * conceito do `DueDateFilterKey` acima (aquele filtra, na tela, uma lista que já está carregada;
 * este decide o que é buscado do banco). Um lançamento com vencimento mais antigo que essa janela
 * nunca aparece na lista, mesmo que o usuário troque `DueDateFilterKey` — por isso o aviso em
 * `isOutsideRefreshWindow` abaixo, mostrado ao criar/editar/duplicar um lançamento que caiu fora
 * dela.
 */
export const REFRESH_WINDOW_DAYS = 120;

/** Verdadeiro se `dataVencimento` é mais antiga que `REFRESH_WINDOW_DAYS` dias atrás — ou seja, vai
 *  desaparecer da lista de Contas a Pagar/Receber até o usuário consultar diretamente um período
 *  anterior (hoje não há nenhum filtro na tela que amplie essa busca; é sempre os últimos
 *  `REFRESH_WINDOW_DAYS` dias). Vencimentos futuros nunca contam como "fora": a janela só tem piso,
 *  não teto, de propósito (ver comentário em `page.tsx`). */
export function isOutsideRefreshWindow(dataVencimento: Date, now: Date = new Date()): boolean {
  return dataVencimento < subDays(now, REFRESH_WINDOW_DAYS);
}

/** Mesmo texto nas duas telas (Contas a Pagar e Contas a Receber) — ver `isOutsideRefreshWindow`. */
export const OUTSIDE_REFRESH_WINDOW_MESSAGE = `Lançamento salvo normalmente, mas o vencimento é mais antigo que os últimos ${REFRESH_WINDOW_DAYS} dias mostrados nesta lista — por isso ele não aparece aqui.`;
