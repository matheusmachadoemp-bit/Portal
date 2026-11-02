"use client";

import { useEffect, useState } from "react";
import { Section } from "@/components/ui/stat-card";
import { SortableStatCards } from "@/components/ui/sortable-stat-cards";
import { PeriodFilterBar } from "@/components/ui/period-filter";
import type { RollingPeriodKey } from "@/lib/periods";
import { formatNumber, formatPercent } from "@/lib/calc";
import { RelatoriosCharts } from "./charts";

type OcupacaoAmbiente = {
  environmentId: string;
  name: string;
  capacity: number;
  totalPessoas: number;
  totalReservas: number;
  ocupacaoPercent: number;
};
type HorarioPico = { hour: string; total: number };
type ReportResponse = {
  totalReservas: number;
  noShowCount: number;
  noShowRate: number;
  canceladaCount: number;
  cancelamentoRate: number;
  tamanhoMedioGrupo: number;
  ocupacaoPorAmbiente: OcupacaoAmbiente[];
  horariosPico: HorarioPico[];
};

/**
 * Tela "Relatórios" do módulo Reservas (Etapa 4) — KPIs e gráficos agregados sobre `Reservation`
 * num período, consumidos de `GET /api/reservas/relatorios` (agregação server-side, sem N+1 —
 * ver src/lib/reservas-relatorios.ts). Filtro de período padrão do portal
 * (`PeriodFilterBar`/`STANDARD_PERIOD_OPTIONS`, default "Este mês").
 */
export function RelatoriosReservasClient({ hasEmpresa }: { hasEmpresa: boolean }) {
  const [periodo, setPeriodo] = useState<RollingPeriodKey>("mes-atual");
  const [data, setData] = useState<ReportResponse | null>(null);
  const [loading, setLoading] = useState(hasEmpresa);
  const [loadError, setLoadError] = useState<string | null>(null);

  async function load(key: RollingPeriodKey, from?: string, to?: string) {
    setLoading(true);
    setLoadError(null);
    try {
      const params = new URLSearchParams({ key });
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      const res = await fetch(`/api/reservas/relatorios?${params.toString()}`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setLoadError(json?.error ?? "Não foi possível carregar o relatório de Reservas.");
        return;
      }
      setData(json);
      setPeriodo(key);
    } catch {
      setLoadError("Falha de conexão. Verifique sua internet e tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!hasEmpresa) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carrega o relatório no mount
    load("mes-atual");
  }, [hasEmpresa]);

  if (!hasEmpresa) {
    return (
      <Section title="Relatórios">
        <p className="text-sm text-nord-gray">Selecione uma loja específica para ver os relatórios de Reservas.</p>
      </Section>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <PeriodFilterBar periodo={periodo} onApply={(key, from, to) => load(key, from, to)} loading={loading} />
        {loading && <span className="text-xs text-nord-gray animate-pulse">Atualizando...</span>}
      </div>

      {loadError && <div className="nord-card p-6 text-center text-sm text-nord-danger">{loadError}</div>}

      {!loadError && !data && (
        <div className="nord-card p-8 text-center text-sm text-nord-gray">Carregando...</div>
      )}

      {!loadError && data && data.totalReservas === 0 && (
        <Section title="Reservas no período">
          <p className="text-sm text-nord-gray py-6 text-center">Nenhuma reserva registrada no período selecionado.</p>
        </Section>
      )}

      {!loadError && data && data.totalReservas > 0 && (
        <>
          <SortableStatCards
            storageKey="reservas-relatorios-kpi-order"
            className="grid grid-cols-2 md:grid-cols-4 gap-4"
            cards={[
              { key: "total-reservas", label: "Total de reservas", value: formatNumber(data.totalReservas), icon: "ClipboardList" },
              {
                key: "taxa-no-show",
                label: "Taxa de não comparecimento",
                value: formatPercent(data.noShowRate),
                hint: `${formatNumber(data.noShowCount)} reserva(s)`,
                icon: "UserX",
                color: "#ef4444",
              },
              {
                key: "taxa-cancelamento",
                label: "Taxa de cancelamento",
                value: formatPercent(data.cancelamentoRate),
                hint: `${formatNumber(data.canceladaCount)} reserva(s)`,
                icon: "XCircle",
                color: "#eab308",
              },
              {
                key: "tamanho-medio-grupo",
                label: "Tamanho médio do grupo",
                value: `${formatNumber(data.tamanhoMedioGrupo, 1)} pessoas`,
                icon: "Users",
              },
            ]}
          />
          <RelatoriosCharts ocupacaoPorAmbiente={data.ocupacaoPorAmbiente} horariosPico={data.horariosPico} />
        </>
      )}
    </div>
  );
}
