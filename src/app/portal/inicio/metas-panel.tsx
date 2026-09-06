"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { Section, Badge, ProgressBar } from "@/components/ui/stat-card";
import { FormError } from "@/components/ui/modal";
import { formatCurrency, formatPercent } from "@/lib/calc";
import { GOAL_CATEGORY_LABEL, GOAL_CATEGORY_ROUTE, type GoalCategoryKey } from "@/lib/goals";

// ---------------------------------------------------------------------------
// "Progresso das metas" — GET /api/inicio/metas-setores?empresaId=X. Assim
// como rotina e alertas, esta rota é sempre "o mês corrente" (não depende do
// período selecionado no topo da tela), então este painel só refaz a busca
// quando a loja ativa muda.
//
// O array pode repetir o mesmo `setor` mais de uma vez (a loja pode ter mais
// de uma meta cadastrada no mesmo setor/mês, ex.: faturamento e CMV, em
// unidades diferentes) — por isso cada entrada vira seu próprio card, sem
// tentar agrupar por nome de setor.
// ---------------------------------------------------------------------------

type MetaSetorStatus = "no_ritmo" | "abaixo_ritmo" | "atingida";

type MetaSetorItem = {
  setor: string;
  percentual: number;
  meta: number;
  realizado: number;
  status: MetaSetorStatus;
  responsavel: string | null;
  projecaoFechamento: number;
};

const STATUS_LABEL: Record<MetaSetorStatus, string> = {
  atingida: "Meta atingida",
  no_ritmo: "No ritmo",
  abaixo_ritmo: "Abaixo do ritmo",
};

const STATUS_TONE: Record<MetaSetorStatus, "success" | "warning" | "info"> = {
  atingida: "success",
  no_ritmo: "info",
  abaixo_ritmo: "warning",
};

const STATUS_COLOR: Record<MetaSetorStatus, string> = {
  atingida: "#22c55e",
  no_ritmo: "#1464f4",
  abaixo_ritmo: "#f59e0b",
};

// Reverte GOAL_CATEGORY_LABEL (categoria -> nome exibido) para achar a
// sub-rota de /portal/metas/[sub] a partir do nome do setor que a rota já
// devolve pronto (ver GOAL_CATEGORY_ROUTE em src/lib/goals.ts).
const SETOR_LABEL_TO_ROUTE: Record<string, string> = Object.fromEntries(
  (Object.keys(GOAL_CATEGORY_LABEL) as GoalCategoryKey[]).map((key) => [GOAL_CATEGORY_LABEL[key], GOAL_CATEGORY_ROUTE[key]])
);

function setorHref(setor: string): string {
  const rota = SETOR_LABEL_TO_ROUTE[setor];
  return rota ? `/portal/metas/${rota}` : "/portal/metas";
}

function MetaCardSkeleton() {
  return (
    <div className="rounded-xl border border-nord-border p-4 space-y-3 animate-pulse">
      <div className="flex items-center justify-between">
        <div className="h-3 w-20 bg-white/5 rounded" />
        <div className="h-4 w-16 bg-white/5 rounded-full" />
      </div>
      <div className="h-6 w-14 bg-white/5 rounded" />
      <div className="h-2 w-full bg-white/5 rounded-full" />
      <div className="grid grid-cols-2 gap-2 pt-1">
        <div className="h-6 w-full bg-white/5 rounded" />
        <div className="h-6 w-full bg-white/5 rounded" />
      </div>
    </div>
  );
}

export function MetasPanel({ empresaId }: { empresaId: string }) {
  const [setores, setSetores] = useState<MetaSetorItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/inicio/metas-setores?empresaId=${encodeURIComponent(empresaId)}`);
      if (!res.ok) {
        setError("Não foi possível carregar o progresso das metas. Tente novamente em instantes.");
        return;
      }
      const data = await res.json();
      setSetores(data.setores);
    } catch {
      setError("Não foi possível carregar o progresso das metas. Tente novamente em instantes.");
    } finally {
      setLoading(false);
    }
  }, [empresaId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- busca as metas do mês ao montar e sempre que a loja ativa muda
    load();
  }, [load]);

  return (
    <Section
      title="Progresso das metas"
      action={loading && setores ? <span className="text-xs text-nord-gray animate-pulse">Atualizando...</span> : undefined}
    >
      <FormError message={error} />

      {setores === null ? (
        loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            <MetaCardSkeleton />
            <MetaCardSkeleton />
            <MetaCardSkeleton />
          </div>
        ) : null
      ) : setores.length === 0 ? (
        <div className="flex items-center gap-2 py-2 text-sm text-nord-gray">
          <CheckCircle2 size={16} className="text-nord-success shrink-0" />
          Nenhuma meta cadastrada este mês.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {setores.map((item, idx) => (
            <Link
              key={idx}
              href={setorHref(item.setor)}
              className="nord-card p-4 flex flex-col gap-3 hover:border-white/20 transition-colors"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-white text-sm font-medium truncate">{item.setor}</span>
                <Badge tone={STATUS_TONE[item.status]}>{STATUS_LABEL[item.status]}</Badge>
              </div>

              <span className="text-white text-2xl font-semibold tracking-tight">{formatPercent(item.percentual)}</span>
              <ProgressBar percent={item.percentual} color={STATUS_COLOR[item.status]} />

              <div className="grid grid-cols-2 gap-x-2 gap-y-2 pt-1 border-t border-nord-border">
                <div>
                  <p className="text-nord-gray text-[11px]">Meta</p>
                  <p className="text-white text-sm font-medium truncate">{formatCurrency(item.meta)}</p>
                </div>
                <div>
                  <p className="text-nord-gray text-[11px]">Realizado</p>
                  <p className="text-white text-sm font-medium truncate">{formatCurrency(item.realizado)}</p>
                </div>
                <div>
                  <p className="text-nord-gray text-[11px]">Projeção de fechamento</p>
                  <p className="text-white text-sm font-medium truncate">{formatCurrency(item.projecaoFechamento)}</p>
                </div>
                {item.responsavel && (
                  <div>
                    <p className="text-nord-gray text-[11px]">Responsável</p>
                    <p className="text-white text-sm font-medium truncate">{item.responsavel}</p>
                  </div>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </Section>
  );
}
