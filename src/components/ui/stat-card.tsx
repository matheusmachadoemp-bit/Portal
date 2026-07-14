import { TrendingDown, TrendingUp } from "lucide-react";
import { DynamicIcon } from "@/components/dynamic-icon";
import { ReactNode } from "react";

export function StatCard({
  label,
  value,
  icon,
  delta,
  color = "#2952E3",
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
    <div className="nord-card p-4 flex flex-col gap-2 min-w-0">
      <div className="flex items-center justify-between">
        <span className="text-xs text-nord-gray truncate">{label}</span>
        {icon && (
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
            style={{ backgroundColor: `${color}22` }}
          >
            <DynamicIcon name={icon} size={14} style={{ color }} />
          </div>
        )}
      </div>
      <span className="text-white text-xl font-semibold truncate">{value}</span>
      <div className="flex items-center gap-1 min-h-[16px]">
        {delta !== undefined && delta !== null && (
          <>
            {positive ? (
              <TrendingUp size={13} className="text-emerald-400" />
            ) : (
              <TrendingDown size={13} className="text-red-400" />
            )}
            <span className={`text-xs ${positive ? "text-emerald-400" : "text-red-400"}`}>
              {positive ? "+" : ""}
              {delta.toFixed(1)}%
            </span>
            <span className="text-xs text-nord-gray">vs. período anterior</span>
          </>
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
    success: "bg-emerald-500/15 text-emerald-400",
    warning: "bg-amber-500/15 text-amber-400",
    danger: "bg-red-500/15 text-red-400",
    info: "bg-nord-blue/15 text-nord-blue-light",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${tones[tone]}`}>
      {children}
    </span>
  );
}

export function ProgressBar({ percent, color = "#2952E3" }: { percent: number; color?: string }) {
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
