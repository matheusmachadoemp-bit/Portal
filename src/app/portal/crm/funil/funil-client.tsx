"use client";

import Link from "next/link";
import { ChevronDown, AlertTriangle } from "lucide-react";
import { Section } from "@/components/ui/stat-card";
import { formatNumber, formatPercent } from "@/lib/calc";

type FunilStage = { key: string; label: string; count: number };

const STAGE_STATUS_LINK: Record<string, string> = {
  novos: "/portal/crm/clientes",
  segunda: "/portal/crm/clientes",
  recorrentes: "/portal/crm/clientes?status=RECORRENTE",
  fieis: "/portal/crm/clientes?status=RECORRENTE,VIP",
  vip: "/portal/crm/clientes?status=VIP",
};

const COLORS = ["#2952E3", "#3b6bf0", "#22c55e", "#f59e0b", "#a855f7"];

export function FunilClient({ funil }: { funil: FunilStage[] }) {
  const max = funil[0]?.count || 1;
  const conversions = funil.slice(1).map((stage, idx) => {
    const prev = funil[idx];
    return prev.count ? (stage.count / prev.count) * 100 : 0;
  });
  const worstIdx = conversions.length ? conversions.indexOf(Math.min(...conversions)) : -1;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2">
        <Section title="Funil de conversão">
          <div className="space-y-1 max-w-xl mx-auto py-2">
            {funil.map((stage, idx) => {
              const widthPct = Math.max(12, (stage.count / max) * 100);
              return (
                <div key={stage.key}>
                  <Link href={STAGE_STATUS_LINK[stage.key] ?? "/portal/crm/clientes"} className="block group">
                    <div
                      className="mx-auto rounded-xl py-4 text-center transition group-hover:brightness-110"
                      style={{ width: `${widthPct}%`, backgroundColor: `${COLORS[idx]}22`, border: `1px solid ${COLORS[idx]}55` }}
                    >
                      <p className="text-white font-semibold text-lg">{formatNumber(stage.count)}</p>
                      <p className="text-xs" style={{ color: COLORS[idx] }}>
                        {stage.label}
                      </p>
                    </div>
                  </Link>
                  {idx < funil.length - 1 && (
                    <div className="flex flex-col items-center py-1.5">
                      <ChevronDown size={16} className="text-nord-gray/50" />
                      <span
                        className={`text-xs font-medium ${
                          idx === worstIdx ? "text-amber-400" : "text-nord-gray"
                        }`}
                      >
                        {formatPercent(conversions[idx])}
                        {idx === worstIdx && " · maior perda"}
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Section>
      </div>

      <div className="space-y-4">
        <Section title="Leitura do funil">
          <div className="space-y-3 text-sm">
            {funil.map((stage) => (
              <div key={stage.key} className="flex items-center justify-between">
                <span className="text-nord-gray">{stage.label}</span>
                <span className="text-white font-medium">{formatNumber(stage.count)}</span>
              </div>
            ))}
          </div>
        </Section>

        {worstIdx >= 0 && (
          <div className="nord-card p-4 border-l-2 border-amber-500">
            <div className="flex items-start gap-2">
              <AlertTriangle size={16} className="text-amber-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-white text-sm font-medium">
                  Maior perda entre {funil[worstIdx].label} e {funil[worstIdx + 1].label}
                </p>
                <p className="text-xs text-nord-gray mt-1">
                  Apenas {formatPercent(conversions[worstIdx])} dos clientes avançam para essa etapa. Considere uma
                  automação ou campanha para reforçar essa transição.
                </p>
                <Link href="/portal/crm/automacoes" className="inline-block mt-2 text-xs font-medium text-nord-blue-light hover:text-white">
                  Criar automação →
                </Link>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
