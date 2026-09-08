"use client";

import { useCallback, useEffect, useState } from "react";
import { format } from "date-fns";
import { Medal } from "lucide-react";
import { Section } from "@/components/ui/stat-card";
import { FormError } from "@/components/ui/modal";
import { DynamicIcon } from "@/components/dynamic-icon";
import type { ConquistaResumo } from "@/lib/conquistas";

// ---------------------------------------------------------------------------
// "Conquistas" — GET /api/inicio/conquistas?empresaId=X. Assim como rotina e
// Loja Nord, esta rota é sempre "o estado atual do usuário" (não depende do
// período selecionado em nenhum outro lugar da tela), então este painel só
// refaz a busca quando a loja ativa muda.
//
// `ConquistaResumo` vem de src/lib/conquistas.ts via `import type` (apagado
// na compilação, o Prisma usado lá dentro nunca entra no bundle do client) —
// mesma prática já usada por alertas-panel.tsx para não dessincronizar o
// formato se a rota ganhar campos novos no futuro.
//
// Tom dourado (#eab308) usado no ícone do estado vazio é o mesmo já
// reservado no resto do módulo Loja Nord para "conquista" (ver comentário em
// loja-nord-panel.tsx) — mantém a mesma identidade visual em vez de inventar
// um tom novo.
// ---------------------------------------------------------------------------

const GOLD = "#eab308";

type ConquistasResponse = { conquistas: ConquistaResumo[] };

function ConquistaCardSkeleton() {
  return (
    <div className="flex flex-col items-center text-center gap-2 p-4 rounded-xl border border-nord-border animate-pulse">
      <div className="w-12 h-12 rounded-full bg-white/5" />
      <div className="h-2.5 w-16 bg-white/5 rounded" />
      <div className="h-2 w-20 bg-white/5 rounded" />
    </div>
  );
}

export function ConquistasPanel({ empresaId }: { empresaId: string }) {
  const [dados, setDados] = useState<ConquistasResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/inicio/conquistas?empresaId=${encodeURIComponent(empresaId)}`);
      if (!res.ok) {
        setError("Não foi possível carregar suas conquistas. Tente novamente em instantes.");
        return;
      }
      setDados(await res.json());
    } catch {
      setError("Não foi possível carregar suas conquistas. Tente novamente em instantes.");
    } finally {
      setLoading(false);
    }
  }, [empresaId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- busca as conquistas ao montar e sempre que a loja ativa muda
    load();
  }, [load]);

  return (
    <Section
      title="Conquistas"
      action={loading && dados ? <span className="text-xs text-nord-gray animate-pulse">Atualizando...</span> : undefined}
    >
      <FormError message={error} />

      {dados === null ? (
        loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6 gap-3">
            <ConquistaCardSkeleton />
            <ConquistaCardSkeleton />
            <ConquistaCardSkeleton />
          </div>
        ) : null
      ) : dados.conquistas.length === 0 ? (
        <div className="flex items-center gap-2 py-2 text-sm text-nord-gray">
          <Medal size={16} style={{ color: GOLD }} className="shrink-0" />
          Nenhuma conquista ainda — continue assim!
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6 gap-3">
          {dados.conquistas.map((c) => (
            <div
              key={c.key}
              className="flex flex-col items-center text-center gap-2 p-4 rounded-xl border border-nord-border hover:border-white/20 transition-colors"
            >
              <div
                className="w-12 h-12 rounded-full flex items-center justify-center shrink-0"
                style={{ backgroundColor: `${c.cor}22` }}
              >
                <DynamicIcon name={c.icone} size={24} style={{ color: c.cor }} />
              </div>
              <p className="text-white text-xs font-medium">{c.nome}</p>
              <p className="text-nord-gray text-[11px] line-clamp-2">{c.descricao}</p>
              <p className="text-nord-gray text-[10px]">
                Conquistada em {format(new Date(c.conquistadaEm), "dd/MM/yyyy")}
              </p>
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}
