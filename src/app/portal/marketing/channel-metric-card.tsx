import { ArrowDownRight, ArrowUpRight, HelpCircle } from "lucide-react";

export type ChannelMetric = { label: string; value: string; change?: number | null; previous?: string | null; inverse?: boolean; hint?: string };

export function ChannelMetricCard({ metric }: { metric: ChannelMetric }) {
  const hasChange = metric.change !== null && metric.change !== undefined;
  const favorable = hasChange ? (metric.inverse ? metric.change! <= 0 : metric.change! >= 0) : false;
  return (
    <article className="nord-card min-h-36 p-4 flex flex-col justify-between">
      <div className="flex items-start justify-between gap-2"><p className="text-sm font-medium text-white leading-snug">{metric.label}</p>{metric.hint && <HelpCircle size={14} className="text-nord-gray shrink-0" aria-label={metric.hint} />}</div>
      <div className="mt-4"><div className="flex flex-wrap items-center gap-2"><p className="text-2xl font-semibold text-white tracking-tight">{metric.value}</p>
        {hasChange && <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${favorable ? "bg-emerald-500/15 text-emerald-400" : "bg-red-500/15 text-red-400"}`}>{metric.change! >= 0 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}{metric.change! >= 0 ? "+" : ""}{metric.change!.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%</span>}
      </div>{metric.previous && <p className="text-xs text-nord-gray mt-1.5">{metric.previous} no período anterior</p>}</div>
    </article>
  );
}
