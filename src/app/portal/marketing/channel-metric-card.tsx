import { TrendingDown, TrendingUp, HelpCircle } from "lucide-react";
import { DynamicIcon } from "@/components/dynamic-icon";

export type ChannelMetric = {
  label: string;
  value: string;
  change?: number | null;
  previous?: string | null;
  inverse?: boolean;
  hint?: string;
  icon?: string;
  color?: string;
};

export function ChannelMetricCard({ metric }: { metric: ChannelMetric }) {
  const hasChange = metric.change !== null && metric.change !== undefined;
  const favorable = hasChange ? (metric.inverse ? metric.change! <= 0 : metric.change! >= 0) : false;
  const color = metric.color ?? "#1464F4";
  return (
    <article
      className="nord-card min-h-36 p-4 flex flex-col justify-between border-t-2"
      style={{ borderTopColor: color }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {metric.icon && (
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
              style={{ backgroundColor: `${color}22` }}
            >
              <DynamicIcon name={metric.icon} size={16} style={{ color }} />
            </div>
          )}
          <p className="text-sm font-medium text-white leading-snug truncate">{metric.label}</p>
        </div>
        {metric.hint && <HelpCircle size={14} className="text-nord-gray shrink-0" aria-label={metric.hint} />}
      </div>
      <div className="mt-4">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-2xl font-semibold text-white tracking-tight">{metric.value}</p>
          {hasChange && (
            <span
              className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium ${
                favorable ? "bg-nord-success/15 text-nord-success" : "bg-nord-danger/15 text-nord-danger"
              }`}
            >
              {metric.change! >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
              {metric.change! >= 0 ? "+" : ""}
              {metric.change!.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%
            </span>
          )}
        </div>
        {metric.previous && <p className="text-xs text-nord-gray mt-1.5">{metric.previous} no período anterior</p>}
      </div>
    </article>
  );
}
