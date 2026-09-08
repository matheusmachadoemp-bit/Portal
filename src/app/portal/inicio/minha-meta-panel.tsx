"use client";

import { useCallback, useEffect, useState } from "react";
import { format } from "date-fns";
import { Target } from "lucide-react";
import { Section, Badge, ProgressBar } from "@/components/ui/stat-card";
import { FormError } from "@/components/ui/modal";
import { formatCurrency, formatPercent } from "@/lib/calc";
import type { MinhaMetaResumo } from "@/lib/inicio";

// ---------------------------------------------------------------------------
// "Minha meta" — GET /api/inicio/minha-meta?empresaId=X. Assim como rotina e
// Loja Nord, esta rota é sempre "a meta mais relevante agora" (não depende do
// período selecionado em nenhum outro lugar da tela), então este painel só
// refaz a busca quando a loja ativa muda.
//
// `MinhaMetaResumo` vem de src/lib/inicio.ts via `import type` (apagado na
// compilação, o Prisma usado lá dentro nunca entra no bundle do client) em
// vez de duplicado aqui — mesma prática já usada por alertas-panel.tsx para
// não dessincronizar o formato se a rota mudar no futuro.
//
// `dados` (a resposta inteira) só é `null` enquanto ainda não carregou;
// `dados.meta` é o `null` de verdade vindo da API (usuário sem meta ativa no
// período) — mesma distinção de "ainda carregando" vs. "carregou e está
// vazio" usada em manutencao-resumo-panel.tsx.
// ---------------------------------------------------------------------------

type MinhaMetaResponse = { meta: MinhaMetaResumo | null };

const STATUS_LABEL: Record<string, string> = {
  NAO_INICIADA: "Não iniciada",
  EM_ANDAMENTO: "Em andamento",
  EM_RISCO: "Em risco",
  CONCLUIDA: "Concluída",
  NAO_ATINGIDA: "Não atingida",
};

const STATUS_TONE: Record<string, "default" | "success" | "warning" | "danger" | "info"> = {
  NAO_INICIADA: "default",
  EM_ANDAMENTO: "info",
  EM_RISCO: "warning",
  CONCLUIDA: "success",
  NAO_ATINGIDA: "danger",
};

const STATUS_COLOR: Record<string, string> = {
  NAO_INICIADA: "#9aa4b2",
  EM_ANDAMENTO: "#1464f4",
  EM_RISCO: "#f59e0b",
  CONCLUIDA: "#22c55e",
  NAO_ATINGIDA: "#ef4444",
};

function MinhaMetaSkeleton() {
  return (
    <div className="space-y-3 animate-pulse">
      <div className="flex items-center justify-between">
        <div className="h-3.5 w-40 bg-white/5 rounded" />
        <div className="h-4 w-20 bg-white/5 rounded-full" />
      </div>
      <div className="h-2 w-full bg-white/5 rounded-full" />
      <div className="h-3 w-2/3 bg-white/5 rounded" />
      <div className="grid grid-cols-2 gap-3 pt-1">
        <div className="h-8 bg-white/5 rounded" />
        <div className="h-8 bg-white/5 rounded" />
      </div>
    </div>
  );
}

export function MinhaMetaPanel({ empresaId }: { empresaId: string }) {
  const [dados, setDados] = useState<MinhaMetaResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/inicio/minha-meta?empresaId=${encodeURIComponent(empresaId)}`);
      if (!res.ok) {
        setError("Não foi possível carregar sua meta. Tente novamente em instantes.");
        return;
      }
      setDados(await res.json());
    } catch {
      setError("Não foi possível carregar sua meta. Tente novamente em instantes.");
    } finally {
      setLoading(false);
    }
  }, [empresaId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- busca a meta ao montar e sempre que a loja ativa muda
    load();
  }, [load]);

  return (
    <Section
      title="Minha meta"
      action={loading && dados ? <span className="text-xs text-nord-gray animate-pulse">Atualizando...</span> : undefined}
    >
      <FormError message={error} />

      {dados === null ? (
        loading ? (
          <MinhaMetaSkeleton />
        ) : null
      ) : dados.meta === null ? (
        <div className="flex items-center gap-2 py-2 text-sm text-nord-gray">
          <Target size={16} className="shrink-0" />
          Nenhuma meta ativa no momento.
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <p className="text-white text-sm font-medium truncate">{dados.meta.nome}</p>
            <Badge tone={STATUS_TONE[dados.meta.status] ?? "default"}>
              {STATUS_LABEL[dados.meta.status] ?? dados.meta.status.replaceAll("_", " ")}
            </Badge>
          </div>

          <ProgressBar percent={dados.meta.percentual} color={STATUS_COLOR[dados.meta.status] ?? "#1464f4"} />

          <div className="flex items-center justify-between text-xs flex-wrap gap-1">
            <span className="text-nord-gray">
              Realizado: <span className="text-white font-medium">{formatCurrency(dados.meta.resultadoAlcancado)}</span>
              {" "}/ Meta:{" "}
              <span className="text-white font-medium">{formatCurrency(dados.meta.metaDefinida)}</span>
            </span>
            <span className="text-white font-medium">{formatPercent(dados.meta.percentual)}</span>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-3 border-t border-nord-border">
            <div>
              <p className="text-nord-gray text-[11px]">Valor restante</p>
              <p className="text-white text-sm font-medium">{formatCurrency(dados.meta.valorRestante)}</p>
            </div>
            <div>
              <p className="text-nord-gray text-[11px]">Prazo</p>
              <p className="text-white text-sm font-medium">{format(new Date(dados.meta.prazo), "dd/MM/yyyy")}</p>
            </div>
          </div>
        </div>
      )}
    </Section>
  );
}
