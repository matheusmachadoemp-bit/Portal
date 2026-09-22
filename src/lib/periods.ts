import { spDateKey, spStartOfDay, spEndOfDay } from "@/lib/checklist";

export type PeriodKey =
  | "hoje"
  | "ontem"
  | "7dias"
  | "semana"
  | "semana-anterior"
  | "mes"
  | "mes-anterior"
  | "personalizado";

// ---------------------------------------------------------------------------
// Cálculo de calendário sempre no fuso de São Paulo, NUNCA no fuso do runtime
// onde o código roda.
//
// Bug real corrigido aqui: `resolvePeriod`/`resolveRollingPeriod` usavam
// `startOfDay`/`endOfDay`/`startOfWeek`/`endOfWeek`/`startOfMonth`/
// `endOfMonth`/`subMonths` do `date-fns` puro sobre `new Date()` — essas
// funções usam os métodos LOCAIS do JS (`getDate`/`setDate`/`getMonth`/...),
// cujo resultado depende do fuso horário do processo onde o código roda: no
// navegador do usuário (América/São_Paulo) e no servidor (Vercel roda em UTC
// por padrão) dão respostas DIFERENTES para "que dia é hoje" sempre que o
// horário real cai nas ~3h em que o calendário UTC já virou o dia mas o
// calendário de SP ainda não (21h-23h59 em SP) — justamente o horário de
// funcionamento da loja (18h-23h30), quando a maior parte das vendas
// acontece. Isso fazia `Vendas > Faturamento`, com período "Ontem" calculado
// no servidor, não achar boa parte (ou nenhuma) das vendas de ontem que
// `Vendas > Lançamentos` (que manda `from`/`to` já prontos calculados no
// navegador) mostrava normalmente.
//
// Correção: todo cálculo de dia/semana/mês é feito a partir da chave
// "YYYY-MM-DD" de São Paulo (`spDateKey`/`spStartOfDay`/`spEndOfDay`, os
// mesmos helpers de fuso fixo já usados por Checklist/Fechamento do
// Dia/Escala de Folgas em `@/lib/checklist` — reaproveitados aqui em vez de
// duplicar o truque do offset fixo), nunca a partir de getters/setters locais
// do runtime. `spAddDays`/`spSubWeeks` são só aritmética de milissegundos
// (1 dia em SP = exatas 24h, sem horário de verão desde 2019), então são
// seguros mesmo comparando servidor (UTC) e navegador (SP): o resultado final
// sempre passa de novo por `spStartOfDay`/`spEndOfDay` pra reancorar no
// calendário de SP correto.

/** Campos de calendário (ano, mês 0-based, dia) de um instante, no fuso de São Paulo. */
function spFields(date: Date): { y: number; m: number; d: number } {
  const [y, m, d] = spDateKey(date).split("-").map(Number);
  return { y, m: m - 1, d };
}

/**
 * Monta uma chave "YYYY-MM-DD" a partir de campos de calendário possivelmente
 * fora do intervalo normal (ex.: dia 0, mês -1, dia 32) — `Date.UTC` normaliza
 * automaticamente o rollover de mês/ano, então isso também serve como
 * aritmética de calendário (ex.: "dia 0 do mês seguinte" = último dia do mês
 * atual; "mês -1" = dezembro do ano anterior).
 */
function dateKeyFromFields(y: number, m: number, d: number): string {
  const normalized = new Date(Date.UTC(y, m, d));
  const yy = normalized.getUTCFullYear();
  const mm = String(normalized.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(normalized.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

function spDayStart(date: Date): Date {
  return spStartOfDay(spDateKey(date));
}
function spDayEnd(date: Date): Date {
  return spEndOfDay(spDateKey(date));
}
/** Soma/subtrai dias em SP — seguro como aritmética pura de ms (dia sempre = 24h, sem horário de verão). */
function spAddDays(date: Date, amount: number): Date {
  return new Date(date.getTime() + amount * 24 * 60 * 60 * 1000);
}
function spWeekStart(date: Date, weekStartsOn: number): Date {
  const { y, m, d } = spFields(date);
  const weekday = new Date(Date.UTC(y, m, d)).getUTCDay(); // 0=domingo..6=sábado
  const diff = (weekday - weekStartsOn + 7) % 7;
  return spStartOfDay(dateKeyFromFields(y, m, d - diff));
}
function spWeekEnd(date: Date, weekStartsOn: number): Date {
  const { y, m, d } = spFields(spWeekStart(date, weekStartsOn));
  return spEndOfDay(dateKeyFromFields(y, m, d + 6));
}
function spMonthStart(date: Date): Date {
  const { y, m } = spFields(date);
  return spStartOfDay(dateKeyFromFields(y, m, 1));
}
function spMonthEnd(date: Date): Date {
  const { y, m } = spFields(date);
  return spEndOfDay(dateKeyFromFields(y, m + 1, 0)); // dia 0 do mês seguinte = último dia do mês atual
}
/**
 * "N meses atrás", só para uso imediatamente seguido de `spMonthStart`/
 * `spMonthEnd` (único uso dentro deste arquivo) — por isso sempre normaliza
 * pro dia 1 do mês alvo, evitando o overflow de "dia 31 menos 1 mês" cair
 * num mês mais curto (ex.: 31/mar - 1 mês não pode virar 2 ou 3/mar).
 */
function spSubMonths(date: Date, amount: number): Date {
  const { y, m } = spFields(date);
  return spStartOfDay(dateKeyFromFields(y, m - amount, 1));
}

/** Trata uma string "YYYY-MM-DD" (sempre o formato de `<input type="date">`) como dia de São Paulo. */
function customDayStart(value: string): Date {
  return spStartOfDay(value.slice(0, 10));
}
function customDayEnd(value: string): Date {
  return spEndOfDay(value.slice(0, 10));
}

export function resolvePeriod(
  key: PeriodKey,
  custom?: { from?: string; to?: string }
): { from: Date; to: Date; prevFrom: Date; prevTo: Date } {
  const now = new Date();
  switch (key) {
    case "hoje":
      return {
        from: spDayStart(now),
        to: spDayEnd(now),
        prevFrom: spDayStart(spAddDays(now, -1)),
        prevTo: spDayEnd(spAddDays(now, -1)),
      };
    case "ontem":
      return {
        from: spDayStart(spAddDays(now, -1)),
        to: spDayEnd(spAddDays(now, -1)),
        prevFrom: spDayStart(spAddDays(now, -2)),
        prevTo: spDayEnd(spAddDays(now, -2)),
      };
    case "7dias":
      return {
        from: spDayStart(spAddDays(now, -6)),
        to: spDayEnd(now),
        prevFrom: spDayStart(spAddDays(now, -13)),
        prevTo: spDayEnd(spAddDays(now, -7)),
      };
    case "semana":
      return {
        from: spWeekStart(now, 1),
        to: spWeekEnd(now, 1),
        prevFrom: spWeekStart(spAddDays(now, -7), 1),
        prevTo: spWeekEnd(spAddDays(now, -7), 1),
      };
    case "semana-anterior":
      return {
        from: spWeekStart(spAddDays(now, -7), 1),
        to: spWeekEnd(spAddDays(now, -7), 1),
        prevFrom: spWeekStart(spAddDays(now, -14), 1),
        prevTo: spWeekEnd(spAddDays(now, -14), 1),
      };
    case "mes-anterior":
      return {
        from: spMonthStart(spSubMonths(now, 1)),
        to: spMonthEnd(spSubMonths(now, 1)),
        prevFrom: spMonthStart(spSubMonths(now, 2)),
        prevTo: spMonthEnd(spSubMonths(now, 2)),
      };
    case "personalizado":
      if (custom?.from && custom?.to) {
        const from = customDayStart(custom.from);
        const to = customDayEnd(custom.to);
        const diff = to.getTime() - from.getTime();
        return {
          from,
          to,
          prevFrom: new Date(from.getTime() - diff),
          prevTo: new Date(from.getTime() - 1),
        };
      }
    // eslint-disable-next-line no-fallthrough
    case "mes":
    default:
      return {
        from: spMonthStart(now),
        to: spMonthEnd(now),
        prevFrom: spMonthStart(spSubMonths(now, 1)),
        prevTo: spMonthEnd(spSubMonths(now, 1)),
      };
  }
}

// Padrão de filtro de período do portal — mesmas 6 opções em todas as telas
// que filtram um relatório/lista por período (ver CLAUDE.md). "semana" e
// "semana-anterior" continuam existindo em PeriodKey/resolvePeriod só para uso
// interno (ex.: comparativo fixo de Acompanhamento de Vendas), sem aparecer
// como opção neste seletor.
export const PERIOD_OPTIONS: { key: PeriodKey; label: string }[] = [
  { key: "hoje", label: "Hoje" },
  { key: "ontem", label: "Ontem" },
  { key: "7dias", label: "Últimos 7 dias" },
  { key: "mes", label: "Este mês" },
  { key: "mes-anterior", label: "Mês passado" },
  { key: "personalizado", label: "Personalizado" },
];

// Filtro de período "rolling" (últimos N dias), usado nos mini-filtros de
// cada card (Vendas por Hora, Forma de Pagamento, Área de Entrega).
export type RollingPeriodKey =
  | "hoje"
  | "ontem"
  | "7dias"
  | "30dias"
  | "mes-atual"
  | "mes-passado"
  | "personalizado";

export function resolveRollingPeriod(key: RollingPeriodKey, custom?: { from?: string; to?: string }): { from: Date; to: Date } {
  const now = new Date();
  switch (key) {
    case "hoje":
      return { from: spDayStart(now), to: spDayEnd(now) };
    case "ontem":
      return { from: spDayStart(spAddDays(now, -1)), to: spDayEnd(spAddDays(now, -1)) };
    case "7dias":
      return { from: spDayStart(spAddDays(now, -6)), to: spDayEnd(now) };
    case "mes-atual":
      return { from: spMonthStart(now), to: spDayEnd(now) };
    case "mes-passado":
      return { from: spMonthStart(spSubMonths(now, 1)), to: spMonthEnd(spSubMonths(now, 1)) };
    case "personalizado":
      if (custom?.from && custom?.to) {
        return { from: customDayStart(custom.from), to: customDayEnd(custom.to) };
      }
      case "30dias":
    default:
      return { from: spDayStart(spAddDays(now, -29)), to: spDayEnd(now) };
  }
}

// Padrão de filtro de período do portal (janela "rolling", sem prevFrom/
// prevTo) — mesmas 6 opções em todas as telas que filtram por período e não
// precisam de comparação com o período anterior (ver CLAUDE.md).
export const STANDARD_PERIOD_OPTIONS: { key: RollingPeriodKey; label: string }[] = [
  { key: "hoje", label: "Hoje" },
  { key: "ontem", label: "Ontem" },
  { key: "7dias", label: "Últimos 7 dias" },
  { key: "mes-atual", label: "Este mês" },
  { key: "mes-passado", label: "Mês passado" },
  { key: "personalizado", label: "Personalizado" },
];

/** Alinha a comparação por dia da semana: desloca em múltiplos de 7 dias em vez do diff exato. */
export function resolveSameWeekdayComparison(from: Date, to: Date): { prevFrom: Date; prevTo: Date } {
  const diffDays = Math.round((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  const weeks = Math.max(1, Math.round(diffDays / 7));
  const offsetDays = weeks * 7;
  return {
    prevFrom: new Date(from.getTime() - offsetDays * 24 * 60 * 60 * 1000),
    prevTo: new Date(to.getTime() - offsetDays * 24 * 60 * 60 * 1000),
  };
}
