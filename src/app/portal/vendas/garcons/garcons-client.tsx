"use client";

import { useEffect, useState } from "react";
import { Trophy } from "lucide-react";
import { Section, Badge } from "@/components/ui/stat-card";
import { formatCurrency, formatNumber } from "@/lib/calc";
import { ROLLING_PERIOD_OPTIONS, type RollingPeriodKey } from "@/lib/periods";
import { GarconsImportButton } from "./garcons-import-button";
import type { GarcomRanking } from "@/lib/garcons";

export function GarconsClient({
  initialRanking,
  canCreate,
}: {
  initialRanking: GarcomRanking[];
  canCreate: boolean;
}) {
  const [ranking, setRanking] = useState(initialRanking);
  const [periodo, setPeriodo] = useState<RollingPeriodKey>("30dias");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [loading, setLoading] = useState(false);

  // Depois de importar um novo arquivo, GarconsImportButton chama router.refresh() —
  // como o período selecionado aqui não muda, sincroniza com o dado recém-buscado.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sincroniza com o dado recém-buscado após router.refresh() (ex.: importação de arquivo)
    setRanking(initialRanking);
  }, [initialRanking]);

  async function applyPeriodo(key: RollingPeriodKey, from?: string, to?: string) {
    setPeriodo(key);
    setLoading(true);
    try {
      const params = new URLSearchParams({ periodo: key });
      if (key === "personalizado" && from && to) {
        params.set("from", from);
        params.set("to", to);
      }
      const res = await fetch(`/api/vendas/garcons?${params.toString()}`);
      if (!res.ok) return;
      const data = await res.json();
      setRanking(data.ranking);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <Section
        title="Ranking"
        action={<GarconsImportButton canCreate={canCreate} />}
      >
        <div className="mb-4">
          <div className="flex flex-wrap gap-1.5">
            {ROLLING_PERIOD_OPTIONS.map((opt) => (
              <button
                key={opt.key}
                onClick={() => {
                  if (opt.key !== "personalizado") applyPeriodo(opt.key);
                  else setPeriodo(opt.key);
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium ${
                  periodo === opt.key ? "bg-nord-blue text-white" : "border border-nord-border text-nord-gray hover:text-white"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          {periodo === "personalizado" && (
            <div className="flex items-center gap-2 mt-2">
              <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="input !w-auto" />
              <span className="text-xs text-nord-gray">até</span>
              <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="input !w-auto" />
              <button
                onClick={() => applyPeriodo("personalizado", customFrom, customTo)}
                disabled={!customFrom || !customTo || loading}
                className="btn-primary px-3 py-1.5 text-xs disabled:opacity-50"
              >
                Aplicar
              </button>
            </div>
          )}
        </div>

        <div className="space-y-2">
          {ranking.map((g, idx) => (
            <div key={g.id} className="grid grid-cols-2 md:grid-cols-7 gap-3 items-center rounded-lg border border-nord-border/60 p-3">
              <div className="flex items-center gap-2 md:col-span-2">
                {idx === 0 && <Trophy size={14} className="text-amber-400 shrink-0" />}
                <span className="text-white text-sm font-medium truncate">{idx + 1}º {g.name}</span>
              </div>
              <StatMini label="Total vendido" value={formatCurrency(g.totalVendido)} />
              <StatMini label="Itens vendidos" value={formatNumber(g.qtdItens)} />
              <StatMini label="Ticket médio" value={formatCurrency(g.ticketMedio)} />
              <StatMini label="Mesas atendidas" value={formatNumber(g.mesas)} />
              <StatMini label="Itens/mesa" value={formatNumber(g.itensPorMesa, 1)} />
            </div>
          ))}
          {ranking.length === 0 && (
            <p className="text-sm text-nord-gray text-center py-8">Nenhuma venda com garçom associado nesse período.</p>
          )}
        </div>
      </Section>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {ranking.map((g) => (
          <div key={g.id} className="nord-card p-4">
            <p className="text-white font-medium text-sm mb-2">{g.name}</p>
            <div className="flex gap-2">
              <Badge tone="info">{formatNumber(g.bebidas)} bebidas</Badge>
              <Badge tone="warning">{formatNumber(g.sobremesas)} sobremesas</Badge>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function StatMini({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] text-nord-gray">{label}</p>
      <p className="text-sm text-white font-medium">{value}</p>
    </div>
  );
}
