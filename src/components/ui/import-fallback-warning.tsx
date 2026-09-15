import type { ImportFallbackBucket } from "@/lib/import-fallback";

/**
 * Banner mostrado depois de uma importação de arquivo quando uma fatia
 * significativa das linhas caiu em uma categoria genérica/fallback (ex.:
 * forma de pagamento "Outro", produto ou colaborador não cadastrado — ver
 * `src/lib/import-fallback.ts`). Mesmo padrão visual do aviso de "modo
 * Grupo Nord" usado em outras telas do Portal (texto âmbar sobre fundo
 * âmbar translúcido).
 *
 * Não renderiza nada quando nenhum balde passou do limiar de aviso — uma
 * ou duas linhas isoladas em "Outros" num arquivo grande não deve gerar
 * alarme na tela.
 */
export function ImportFallbackWarning({ buckets }: { buckets?: ImportFallbackBucket[] | null }) {
  const relevant = (buckets ?? []).filter((b) => b.warn);
  if (relevant.length === 0) return null;

  return (
    <div className="text-xs bg-nord-warning/10 border border-nord-warning/30 rounded-lg px-3 py-2 text-nord-warning space-y-1.5">
      {relevant.map((b) => (
        <p key={b.key}>{b.message}</p>
      ))}
    </div>
  );
}
