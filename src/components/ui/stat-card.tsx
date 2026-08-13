import { TrendingDown, TrendingUp } from "lucide-react";
import { DynamicIcon } from "@/components/dynamic-icon";
import { ReactNode } from "react";

export function StatCard({
  label,
  value,
  icon,
  delta,
  color = "#1464F4",
  hint,
}: {
  label: string;
  value: string;
  icon?: string;
  delta?: number | null;
  color?: string;
  hint?: string;
}) {
  const positive = (delta ?? 0) >= 0;
  return (
    <div
      className="nord-card p-4 flex flex-col gap-3 min-w-0 border-t-2 transition-colors hover:border-white/20"
      style={{ borderTopColor: color }}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-nord-gray truncate">{label}</span>
        {icon && (
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
            style={{ backgroundColor: `${color}22` }}
          >
            <DynamicIcon name={icon} size={17} style={{ color }} />
          </div>
        )}
      </div>
      <span className="text-white text-2xl font-semibold tracking-tight truncate">{value}</span>
      <div className="flex items-center gap-1 min-h-[20px]">
        {delta !== undefined && delta !== null && (
          <span
            className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-xs font-medium ${
              positive ? "bg-nord-success/15 text-nord-success" : "bg-nord-danger/15 text-nord-danger"
            }`}
          >
            {positive ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
            {positive ? "+" : ""}
            {delta.toFixed(1)}%
          </span>
        )}
        {delta !== undefined && delta !== null && (
          <span className="text-xs text-nord-gray">vs. período anterior</span>
        )}
        {hint && !delta && <span className="text-xs text-nord-gray">{hint}</span>}
      </div>
    </div>
  );
}

export function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="nord-card p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-white font-medium text-sm">{title}</h3>
        {action}
      </div>
      {children}
    </div>
  );
}

export function Badge({
  children,
  tone = "default",
}: {
  children: ReactNode;
  tone?: "default" | "success" | "warning" | "danger" | "info";
}) {
  const tones: Record<string, string> = {
    default: "bg-white/10 text-nord-gray",
    success: "bg-nord-success/15 text-nord-success",
    warning: "bg-nord-warning/15 text-nord-warning",
    danger: "bg-nord-danger/15 text-nord-danger",
    info: "bg-nord-blue/15 text-nord-blue-light",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${tones[tone]}`}>
      {children}
    </span>
  );
}

export function ProgressBar({ percent, color = "#1464F4" }: { percent: number; color?: string }) {
  const clamped = Math.max(0, Math.min(100, percent));
  return (
    <div className="w-full h-2 rounded-full bg-nord-border overflow-hidden">
      <div
        className="h-full rounded-full transition-all"
        style={{ width: `${clamped}%`, backgroundColor: color }}
      />
    </div>
  );
}
