/**
 * Fuso horário de Brasília (America/Sao_Paulo) para cálculos de data/hora no
 * backend do Portal, via offset fixo.
 *
 * Brasil não observa horário de verão desde 2019 — America/Sao_Paulo é
 * sempre UTC-3, então dá pra tratar o fuso com um offset fixo em vez de uma
 * lib de timezone completa.
 *
 * Módulo centralizado a partir de uma duplicata real: `spDateKey` existia
 * copiada palavra por palavra em `checklist.ts` e `satisfaction.ts`, e
 * `inicio.ts` tinha a mesma conta inline (sem constante nomeada). Os dois
 * arquivos de origem continuam reexportando estes símbolos, então nenhum dos
 * ~30 pontos do app que já importavam `spDateKey`/`spStartOfDay`/
 * `spEndOfDay` de `@/lib/checklist` precisou mudar.
 *
 * Não usar este offset fixo para comparações que dependam de timezone de
 * verdade (DST, outros fusos) — para isso, ver `src/lib/roulette-server.ts`,
 * que usa `Intl`/`America/Sao_Paulo` via API de timezone real (abordagem
 * diferente, não duplicata deste módulo).
 */
export const SP_OFFSET_HOURS = 3;

/** "YYYY-MM-DD" no fuso de São Paulo, a partir de um Date (ou agora). */
export function spDateKey(date: Date = new Date()): string {
  const spTime = new Date(date.getTime() - SP_OFFSET_HOURS * 60 * 60 * 1000);
  return spTime.toISOString().slice(0, 10);
}

/** Meia-noite (00:00) de um "YYYY-MM-DD" em São Paulo, como instante UTC. */
export function spStartOfDay(dateKey: string): Date {
  return new Date(`${dateKey}T00:00:00-03:00`);
}

/**
 * Último instante (23:59:59.999) de um "YYYY-MM-DD" em São Paulo, como
 * instante UTC. Sempre derivado de `spStartOfDay` do mesmo `dateKey` + 24h -
 * 1ms (em vez de reprocessar uma string "T23:59:59-03:00" à parte) para
 * garantir simetria exata com `spStartOfDay` — mesmo dia sempre soma
 * exatamente 24h, já que São Paulo não tem horário de verão desde 2019 (ver
 * `SP_OFFSET_HOURS` acima).
 */
export function spEndOfDay(dateKey: string): Date {
  return new Date(spStartOfDay(dateKey).getTime() + 24 * 60 * 60 * 1000 - 1);
}

const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
// ISO completo COM fuso explícito (Z ou +hh:mm): sem fuso o JS interpreta no fuso do processo (depende de onde roda).
const ISO_INSTANT_PATTERN = /^\d{4}-\d{2}-\d{2}T[\d:.]+(?:Z|[+-]\d{2}:?\d{2})$/;
// Faixa de anos aceita em colunas de DIA do dinheiro: barra "0000-01-01" (o Postgres recusa: dava 500) e erro de
// digitação como "2206-10-25" (a conta sumia da tela, que só carrega alguns meses para trás).
const DAY_YEAR_MIN = 2000;
const DAY_YEAR_MAX = 2100;

/**
 * Valida um "AAAA-MM-DD" vindo de fora (body/query/campo de data) e devolve ele mesmo; `null` se não bater com
 * o formato OU se não for um dia que existe no calendário. A checagem de ida e volta com `spDateKey` é
 * necessária: o JS aceita "2026-02-30" e "2026-04-31" sem avisar e devolve 02/03 e 01/05 (`spStartOfDay` não
 * dá NaN nesses casos). NÃO impõe faixa de anos; a faixa das colunas de dia do dinheiro está
 * em `parseDayInput`.
 */
export function parseDateKey(raw: unknown): string | null {
  if (typeof raw !== "string" || !DATE_KEY_PATTERN.test(raw)) return null;
  const date = spStartOfDay(raw);
  return Number.isNaN(date.getTime()) || spDateKey(date) !== raw ? null : raw;
}

/**
 * Dia ("AAAA-MM-DD") de uma coluna de DIA que JÁ está gravada (ou que veio de volta da API como ISO).
 * Dois formatos convivem até a migration de dados: o LEGADO, `new Date("AAAA-MM-DD")` = exatamente 00:00:00.000Z
 * (o dia certo é o dia UTC do próprio valor), e o NOVO, 03:00Z (o dia de São Paulo). Qualquer outra hora (hora
 * real) vale o dia de São Paulo. NUNCA usar `spDateKey` direto numa coluna de dia legada: 00:00Z cairia no dia
 * anterior (e no 1o do mês cairia no mês anterior). Devolve "" se o valor não for uma data.
 */
export function storedDayKey(value: Date | string): string {
  const instant = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(instant.getTime())) return "";
  const legado = instant.getUTCHours() === 0 && instant.getUTCMinutes() === 0 && instant.getUTCSeconds() === 0 && instant.getUTCMilliseconds() === 0;
  return legado ? instant.toISOString().slice(0, 10) : spDateKey(instant);
}

/**
 * REGRA DAS COLUNAS DE DIA (Contas a Pagar/Receber/Recorrentes e Compras do Estoque): um dia sem hora é gravado
 * SEMPRE como meia-noite de São Paulo (`spStartOfDay` = 03:00Z). Um instante de verdade (createdAt, "agora")
 * continua sendo `new Date()`. NUNCA gravar `new Date(body.dataX)` (meia-noite UTC = 21h do dia anterior em SP).
 *
 * Dia vindo da tela/API -> meia-noite de SP; `null` se inválido ou fora de 2000..2100. Aceita "AAAA-MM-DD" (o que
 * a tela manda) e, SÓ por tolerância a aba antiga (o Duplicar antigo mandava o ISO inteiro da linha, com fuso),
 * um ISO completo, que vira o dia dele segundo `storedDayKey`: 03:00Z fica igual; 00:00:00.000Z (dado legado,
 * ainda não migrado) mantém o dia UTC, que é o dia que a pessoa digitou. TRANSITÓRIO: o ramo ISO pode sair
 * quando não houver mais aba antiga aberta.
 */
export function parseDayInput(raw: unknown): Date | null {
  if (typeof raw !== "string") return null;
  const text = raw.trim();
  let key = parseDateKey(text);
  if (!key && ISO_INSTANT_PATTERN.test(text)) {
    const instant = new Date(text);
    if (!Number.isNaN(instant.getTime())) key = parseDateKey(storedDayKey(instant));
  }
  if (!key) return null;
  const year = Number(key.slice(0, 4));
  return year >= DAY_YEAR_MIN && year <= DAY_YEAR_MAX ? spStartOfDay(key) : null;
}
