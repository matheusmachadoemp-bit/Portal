/** "há 5 min", "há 3 h", "há 2 dias": quanto tempo faz desde `date`, para avisos como "última atualização do banco". */
export function formatSince(date: Date | string, now: Date = new Date()): string {
  const ms = now.getTime() - new Date(date).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "agora mesmo";
  const min = Math.floor(ms / 60_000);
  if (min < 1) return "agora mesmo";
  if (min < 60) return `há ${min} min`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return `há ${hours} h`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "há 1 dia" : `há ${days} dias`;
}

/** A conexão com o banco é considerada parada se a última atualização tem mais que isto (36 h). */
export const BANK_SYNC_STALE_MS = 36 * 60 * 60 * 1000;

export function isBankSyncStale(lastSyncAt: Date | string | null | undefined, now: Date = new Date()): boolean {
  if (!lastSyncAt) return true;
  return now.getTime() - new Date(lastSyncAt).getTime() > BANK_SYNC_STALE_MS;
}
