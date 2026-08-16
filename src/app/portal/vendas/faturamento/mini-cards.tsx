"use client";

import { useEffect, useState } from "react";
import { Calendar } from "lucide-react";
import { Section } from "@/components/ui/stat-card";
import { formatCurrency, formatPercent } from "@/lib/calc";
import { ROLLING_PERIOD_OPTIONS, type RollingPeriodKey } from "@/lib/periods";
import { PAYMENT_METHOD_LABEL } from "@/lib/vendas-analytics";
import { PorHoraChart } from "../por-hora/chart";
import type { SaleChannel, SalePlatform } from "@prisma/client";

type HourBucket = { hour: number; minute: number; label: string; faturamento: number; pedidos: number };
type MethodRow = { method: string; valor: number; percent: number };
type BairroRow = { bairro: string; faturamento: number };

function MiniPeriodFilter({
  periodKey,
  setPeriodKey,
  customFrom,
  setCustomFrom,
  customTo,
  setCustomTo,
  onApplyCustom,
  label,
}: {
  periodKey: RollingPeriodKey;
  setPeriodKey: (k: RollingPeriodKey) => void;
  customFrom: string;
  setCustomFrom: (v: string) => void;
  customTo: string;
  setCustomTo: (v: string) => void;
  onApplyCustom: () => void;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] border border-nord-border text-nord-gray hover:text-white whitespace-nowrap"
      >
        <Calendar size={11} /> {label}
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-2 w-64 nord-card bg-nord-card p-3 space-y-2">
          <div className="flex flex-wrap gap-1.5">
            {ROLLING_PERIOD_OPTIONS.map((opt) => (
              <button
                key={opt.key}
                onClick={() => {
                  setPeriodKey(opt.key);
                  if (opt.key !== "personalizado") setOpen(false);
                }}
                className={`px-2 py-1 rounded-md text-[11px] font-medium ${
                  periodKey === opt.key ? "bg-nord-blue text-white" : "bg-nord-panel text-nord-gray hover:text-white"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          {periodKey === "personalizado" && (
            <div className="flex items-center gap-1.5 pt-1">
              <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="mini-input" />
              <span className="text-[10px] text-nord-gray">até</span>
              <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="mini-input" />
              <button
                onClick={() => {
                  onApplyCustom();
                  setOpen(false);
                }}
                disabled={!customFrom || !customTo}
                className="px-2 py-1 rounded-md text-[11px] bg-nord-blue hover:bg-nord-blue-light disabled:opacity-50 text-white font-medium"
              >
                Aplicar
              </button>
            </div>
          )}
          <style jsx global>{`
            .mini-input {
              background: var(--nord-panel);
              border: 1px solid var(--nord-border);
              border-radius: 6px;
              padding: 4px 6px;
              color: white;
              font-size: 11px;
            }
          `}</style>
        </div>
      )}
    </div>
  );
}

function usePeriodFilter(endpoint: string, channel?: SaleChannel, platform?: SalePlatform, extraParams?: Record<string, string>) {
  const [periodKey, setPeriodKey] = useState<RollingPeriodKey>("30dias");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [appliedCustom, setAppliedCustom] = useState<{ from: string; to: string } | null>(null);
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (periodKey === "personalizado" && !appliedCustom) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- refetches the mini card whenever its own period filter changes
    setLoading(true);
    const params = new URLSearchParams({ key: periodKey, ...(extraParams ?? {}) });
    if (channel) params.set("channel", channel);
    if (platform) params.set("platform", platform);
    if (periodKey === "personalizado" && appliedCustom) {
      params.set("from", appliedCustom.from);
      params.set("to", appliedCustom.to);
    }
    fetch(`${endpoint}?${params.toString()}`)
      .then((res) => res.json())
      .then((d) => setData(d))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endpoint, periodKey, appliedCustom, channel, platform]);

  function applyCustom() {
    setAppliedCustom({ from: customFrom, to: customTo });
  }

  return { periodKey, setPeriodKey, customFrom, setCustomFrom, customTo, setCustomTo, applyCustom, data, loading };
}

export function HoraCard({
  initialData,
  channel,
  platform,
}: {
  initialData: { byHour: HourBucket[]; pico: HourBucket | null };
  channel?: SaleChannel;
  platform?: SalePlatform;
}) {
  const f = usePeriodFilter("/api/vendas/faturamento/por-hora", channel, platform);
  const view = (f.data as unknown as typeof initialData | null) ?? initialData;

  return (
    <Section
      title="Vendas por Hora"
      action={
        <MiniPeriodFilter
          periodKey={f.periodKey}
          setPeriodKey={f.setPeriodKey}
          customFrom={f.customFrom}
          setCustomFrom={f.setCustomFrom}
          customTo={f.customTo}
          setCustomTo={f.setCustomTo}
          onApplyCustom={f.applyCustom}
          label={ROLLING_PERIOD_OPTIONS.find((o) => o.key === f.periodKey)?.label ?? "Período"}
        />
      }
    >
      <p className="text-xs text-nord-gray mb-3">
        18h às 23h30 {view.pico ? `· pico às ${view.pico.label}` : ""}
      </p>
      <PorHoraChart data={view.byHour} />
    </Section>
  );
}

export function PagamentoCard({
  initialData,
  channel,
  platform,
}: {
  initialData: { byMethod: MethodRow[]; pedidos: number };
  channel?: SaleChannel;
  platform?: SalePlatform;
}) {
  const f = usePeriodFilter("/api/vendas/faturamento/pagamento", channel, platform);
  const view = (f.data as unknown as typeof initialData | null) ?? initialData;

  return (
    <Section
      title="Forma de Pagamento"
      action={
        <MiniPeriodFilter
          periodKey={f.periodKey}
          setPeriodKey={f.setPeriodKey}
          customFrom={f.customFrom}
          setCustomFrom={f.setCustomFrom}
          customTo={f.customTo}
          setCustomTo={f.setCustomTo}
          onApplyCustom={f.applyCustom}
          label={ROLLING_PERIOD_OPTIONS.find((o) => o.key === f.periodKey)?.label ?? "Período"}
        />
      }
    >
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

export function EntregaCard({ initialData, platform }: { initialData: { rows: BairroRow[] }; platform?: SalePlatform }) {
  const f = usePeriodFilter("/api/vendas/faturamento/entrega", undefined, platform);
  const view = (f.data as unknown as typeof initialData | null) ?? initialData;
  const max = Math.max(1, ...view.rows.map((r) => r.faturamento));

  return (
    <Section
      title="Área de Entrega"
      action={
        <MiniPeriodFilter
          periodKey={f.periodKey}
          setPeriodKey={f.setPeriodKey}
          customFrom={f.customFrom}
          setCustomFrom={f.setCustomFrom}
          customTo={f.customTo}
          setCustomTo={f.setCustomTo}
          onApplyCustom={f.applyCustom}
          label={ROLLING_PERIOD_OPTIONS.find((o) => o.key === f.periodKey)?.label ?? "Período"}
        />
      }
    >
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
