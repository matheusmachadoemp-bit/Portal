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
