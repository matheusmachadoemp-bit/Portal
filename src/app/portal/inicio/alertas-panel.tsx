"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ClipboardX, CalendarX, TrendingDown, PackageX, Frown, Clock, CheckCircle2, ArrowRight } from "lucide-react";
import { Section } from "@/components/ui/stat-card";
import { FormError } from "@/components/ui/modal";

// ---------------------------------------------------------------------------
// "Alertas importantes" — GET /api/inicio/alertas?empresaId=X. Assim como a
// rotina, esta rota não depende do período selecionado no topo da tela (é
// sempre "agora"), então este painel só refaz a busca quando a loja ativa
// muda. Visual segue o mesmo padrão de card com borda colorida à esquerda já
// usado em "Inteligência CRM" (src/app/portal/crm/dashboard/dashboard-client.tsx).
// ---------------------------------------------------------------------------

type AlertaTipo =
  | "checklist_atrasado"
  | "tarefa_vencida"
  | "meta_abaixo_ritmo"
  | "estoque_baixo"
  | "avaliacao_negativa"
  | "aprovacao_pendente";

type AlertaNivel = "urgente" | "atencao" | "informativo";

type AlertaItem = {
  tipo: AlertaTipo;
  titulo: string;
  loja: string;
  setor: string | null;
  tempoAtrasoOuPrazo: string;
  nivel: AlertaNivel;
  actionHref: string;
};

const TIPO_ICON: Record<AlertaTipo, LucideIcon> = {
  checklist_atrasado: ClipboardX,
  tarefa_vencida: CalendarX,
  meta_abaixo_ritmo: TrendingDown,
  estoque_baixo: PackageX,
  avaliacao_negativa: Frown,
  aprovacao_pendente: Clock,
};

// Mesmos tons de --nord-danger / --nord-warning / --nord-blue do DESIGN_SYSTEM.md.
const NIVEL_COLOR: Record<AlertaNivel, string> = {
  urgente: "#ef4444",
  atencao: "#f59e0b",
  informativo: "#1464f4",
};

const NIVEL_LABEL: Record<AlertaNivel, string> = {
  urgente: "Urgente",
  atencao: "Atenção",
  informativo: "Informativo",
};

function CardSkeleton() {
  return (
    <div className="rounded-xl border border-nord-border p-4 space-y-2 animate-pulse">
      <div className="flex items-start gap-2.5">
        <div className="w-4 h-4 rounded bg-white/5 shrink-0 mt-0.5" />
        <div className="h-3 w-2/3 bg-white/5 rounded" />
      </div>
      <div className="h-2.5 w-1/2 bg-white/5 rounded ml-[26px]" />
    </div>
  );
}

export function AlertasPanel({ empresaId }: { empresaId: string }) {
  const [alertas, setAlertas] = useState<AlertaItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/inicio/alertas?empresaId=${encodeURIComponent(empresaId)}`);
      if (!res.ok) {
        setError("Não foi possível carregar os alertas. Tente novamente em instantes.");
        return;
      }
      const data = await res.json();
      setAlertas(data.alertas);
    } catch {
      setError("Não foi possível carregar os alertas. Tente novamente em instantes.");
    } finally {
      setLoading(false);
    }
  }, [empresaId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- busca os alertas ao montar e sempre que a loja ativa muda
    load();
  }, [load]);

  return (
    <Section
      title="Alertas importantes"
      action={loading && alertas ? <span className="text-xs text-nord-gray animate-pulse">Atualizando...</span> : undefined}
    >
      <FormError message={error} />

      {alertas === null ? (
        loading ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <CardSkeleton />
            <CardSkeleton />
          </div>
        ) : null
      ) : alertas.length === 0 ? (
        <div className="flex items-center gap-2 py-2 text-sm text-nord-gray">
          <CheckCircle2 size={16} className="text-nord-success shrink-0" />
          Nenhum alerta no momento.
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {alertas.map((alerta, idx) => {
            const Icon = TIPO_ICON[alerta.tipo];
            const color = NIVEL_COLOR[alerta.nivel];
            return (
              <div
                key={idx}
                className="rounded-xl border border-nord-border p-4 space-y-2"
                style={{ borderLeft: `3px solid ${color}` }}
              >
                <div className="flex items-start gap-2.5">
                  <Icon size={16} style={{ color }} className="mt-0.5 shrink-0" />
                  <p className="text-white text-sm font-medium">{alerta.titulo}</p>
                </div>
                <p className="text-xs text-nord-gray pl-[26px]">
                  {alerta.loja}
                  {alerta.setor ? ` • ${alerta.setor}` : ""} • {alerta.tempoAtrasoOuPrazo}
                </p>
                <p className="text-xs pl-[26px]" style={{ color }}>
                  {NIVEL_LABEL[alerta.nivel]}
                </p>
                <div className="pl-[26px]">
                  <Link
                    href={alerta.actionHref}
                    className="inline-flex items-center gap-1 text-xs font-medium text-nord-blue-light hover:text-white"
                  >
                    Ver detalhes <ArrowRight size={12} />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Section>
  );
}
