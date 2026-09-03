"use client";

import { CheckCircle2, AlertTriangle, Trophy } from "lucide-react";
import { Badge } from "@/components/ui/stat-card";
import { DynamicIcon } from "@/components/dynamic-icon";
import { formatCurrency } from "@/lib/calc";

export type Status = "batida" | "abaixo" | "sem-dado";

export function statusOf(bateu: boolean | null): Status {
  return bateu === null ? "sem-dado" : bateu ? "batida" : "abaixo";
}

export function statusLabel(s: Status) {
  return s === "batida" ? "Meta batida" : s === "abaixo" ? "Abaixo da meta" : "Sem dado";
}

export function StatusBadge({ status }: { status: Status }) {
  if (status === "sem-dado") return <Badge tone="default">Sem dado</Badge>;
  if (status === "batida")
    return (
      <Badge tone="success">
        <CheckCircle2 size={11} className="inline mr-1 -mt-0.5" />
        Meta batida
      </Badge>
    );
  return (
    <Badge tone="warning">
      <AlertTriangle size={11} className="inline mr-1 -mt-0.5" />
      Abaixo da meta
    </Badge>
  );
}

export function IndicatorCard({
  icon,
  color,
  label,
  status,
  valueSlot,
  metaText,
  premio,
}: {
  icon: string;
  color: string;
  label: string;
  status: Status;
  valueSlot: React.ReactNode;
  metaText: string;
  premio: number;
}) {
  return (
    <div className="nord-card p-4 flex flex-col gap-3 min-w-0 border-t-2" style={{ borderTopColor: color }}>
      <div className="flex flex-wrap items-start gap-2">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: `${color}22` }}>
            <DynamicIcon name={icon} size={20} style={{ color }} />
          </div>
          <span className="text-sm text-white leading-tight">{label}</span>
        </div>
        <div className="shrink-0 whitespace-nowrap">
          <StatusBadge status={status} />
        </div>
      </div>
      {valueSlot}
      <span className="text-xs text-nord-gray">{metaText}</span>
      {status === "batida" && premio > 0 && (
        <span className="text-xs text-amber-400 flex items-center gap-1">
          <Trophy size={11} /> {formatCurrency(premio)} de premiação
        </span>
      )}
    </div>
  );
}
