"use client";

import { useEffect, useState } from "react";
import { Section } from "@/components/ui/stat-card";
import { formatCurrency, formatPercent } from "@/lib/calc";
import type { PeriodKey, RollingPeriodKey } from "@/lib/periods";
import { PAYMENT_METHOD_LABEL } from "@/lib/vendas-analytics";
import { PorHoraChart } from "../por-hora/chart";
import type { SaleChannel, SalePlatform } from "@prisma/client";

type HourBucket = { hour: number; minute: number; label: string; faturamento: number; pedidos: number };
type MethodRow = { method: string; valor: number; percent: number };
type BairroRow = { bairro: string; faturamento: number };

/**
 * O filtro de período de cima (Faturamento) usa `PeriodKey` ("mes" /
 * "mes-anterior", com comparação entre 2 períodos). As rotas dos 3
 * mini-cards (por-hora, pagamento, entrega) usam `RollingPeriodKey`
 * ("mes-atual" / "mes-passado", sem comparação). Os demais valores
 * ("hoje", "ontem", "7dias", "personalizado") já têm o mesmo nome nos
 * dois tipos — só "mes"/"mes-anterior" precisam de tradução. "semana" e
 * "semana-anterior" não aparecem nas opções do filtro de cima (ver
 * PERIOD_OPTIONS em lib/periods.ts), mas entram aqui só para o mapa
 * cobrir todo o tipo `PeriodKey`.
 */
const PERIOD_KEY_TO_ROLLING: Record<PeriodKey, RollingPeriodKey> = {
  hoje: "hoje",
  ontem: "ontem",
  "7dias": "7dias",
  semana: "7dias",
  "semana-anterior": "7dias",
  mes: "mes-atual",
  "mes-anterior": "mes-passado",
  personalizado: "personalizado",
};

function usePeriodFilter(
  endpoint: string,
  periodKey: PeriodKey,
  customFrom: string,
  customTo: string,
  channel?: SaleChannel,
  platform?: SalePlatform,
  extraParams?: Record<string, string>
) {
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (periodKey === "personalizado" && (!customFrom || !customTo)) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- refetches the mini card whenever the shared period filter (or channel/platform) changes
    setLoading(true);
    const params = new URLSearchParams({ key: PERIOD_KEY_TO_ROLLING[periodKey], ...(extraParams ?? {}) });
    if (channel) params.set("channel", channel);
    if (platform) params.set("platform", platform);
    if (periodKey === "personalizado") {
      params.set("from", customFrom);
      params.set("to", customTo);
    }
    fetch(`${endpoint}?${params.toString()}`)
      .then((res) => res.json())
      .then((d) => setData(d))
      .finally(() => setLoading(false));
  }, [endpoint, periodKey, customFrom, customTo, channel, platform, extraParams]);

  return { data, loading };
}

type PeriodProps = {
  periodKey: PeriodKey;
  customFrom: string;
  customTo: string;
};

export function HoraCard({
  initialData,
  periodKey,
  customFrom,
  customTo,
  channel,
  platform,
}: {
  initialData: { byHour: HourBucket[]; pico: HourBucket | null };
  channel?: SaleChannel;
  platform?: SalePlatform;
} & PeriodProps) {
  const f = usePeriodFilter("/api/vendas/faturamento/por-hora", periodKey, customFrom, customTo, channel, platform);
  const view = (f.data as unknown as typeof initialData | null) ?? initialData;

  return (
    <Section title="Vendas por Hora">
      <p className="text-xs text-nord-gray mb-3">
        18h às 23h30 {view.pico ? `· pico às ${view.pico.label}` : ""}
      </p>
      <PorHoraChart data={view.byHour} />
    </Section>
  );
}

export function PagamentoCard({
  initialData,
  periodKey,
  customFrom,
  customTo,
  channel,
  platform,
}: {
  initialData: { byMethod: MethodRow[]; pedidos: number };
  channel?: SaleChannel;
  platform?: SalePlatform;
} & PeriodProps) {
  const f = usePeriodFilter("/api/vendas/faturamento/pagamento", periodKey, customFrom, customTo, channel, platform);
  const view = (f.data as unknown as typeof initialData | null) ?? initialData;

  return (
    <Section title="Forma de Pagamento">
      <p className="text-xs text-nord-gray mb-3">{view.pedidos} pedidos</p>
      <div className="space-y-2.5">
        {view.byMethod.map((m) => (
          <div key={m.method} className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-white">{PAYMENT_METHOD_LABEL[m.method] ?? m.method}</span>
              <span className="text-nord-gray">
                {formatPercent(m.percent)} · {formatCurrency(m.valor)}
              </span>
            </div>
            <div className="w-full h-1.5 rounded-full bg-nord-border overflow-hidden">
              <div className="h-full rounded-full bg-nord-blue" style={{ width: `${Math.max(2, m.percent)}%` }} />
            </div>
          </div>
        ))}
        {view.byMethod.length === 0 && <p className="text-xs text-nord-gray text-center py-4">Nenhuma venda no período.</p>}
      </div>
    </Section>
  );
}

export function EntregaCard({
  initialData,
  periodKey,
  customFrom,
  customTo,
  platform,
}: {
  initialData: { rows: BairroRow[] };
  platform?: SalePlatform;
} & PeriodProps) {
  const f = usePeriodFilter("/api/vendas/faturamento/entrega", periodKey, customFrom, customTo, undefined, platform);
  const view = (f.data as unknown as typeof initialData | null) ?? initialData;
  const max = Math.max(1, ...view.rows.map((r) => r.faturamento));

  return (
    <Section title="Área de Entrega">
      <p className="text-xs text-nord-gray mb-3">Top bairros por faturamento</p>
      <div className="space-y-2.5">
        {view.rows.map((r) => (
          <div key={r.bairro} className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-white font-medium">{r.bairro}</span>
              <span className="text-white">{formatCurrency(r.faturamento)}</span>
            </div>
            <div className="w-full h-1.5 rounded-full bg-nord-border overflow-hidden">
              <div className="h-full rounded-full bg-nord-warning" style={{ width: `${(r.faturamento / max) * 100}%` }} />
            </div>
          </div>
        ))}
        {view.rows.length === 0 && <p className="text-xs text-nord-gray text-center py-4">Nenhum pedido de delivery com bairro informado.</p>}
      </div>
    </Section>
  );
}
