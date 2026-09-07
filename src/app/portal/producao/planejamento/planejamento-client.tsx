"use client";

import { useState } from "react";
import { RefreshCw, Sparkles } from "lucide-react";
import { Section, Badge } from "@/components/ui/stat-card";
import { DynamicIcon } from "@/components/dynamic-icon";
import { PRODUCTION_PRIORITY_COLOR, PRODUCTION_PRIORITY_LABEL } from "@/lib/producao";
import type { ProductionOrderDTO } from "../types";
import { AjusteModal } from "./ajuste-modal";

export function PlanejamentoClient({
  initialOrdens,
  canManage,
}: {
  initialOrdens: ProductionOrderDTO[];
  canManage: boolean;
}) {
  const [ordens, setOrdens] = useState(initialOrdens);
  const [loading, setLoading] = useState(false);
  const [ajustando, setAjustando] = useState<ProductionOrderDTO | null>(null);

  const amanha = new Date();
  amanha.setDate(amanha.getDate() + 1);

  async function refresh() {
    const dayStart = new Date(amanha);
    dayStart.setHours(0, 0, 0, 0);
    const res = await fetch(`/api/producao/ordens?date=${dayStart.toISOString()}`);
    const data = await res.json();
    setOrdens(data.ordens);
  }

  async function gerarPlano() {
    setLoading(true);
    try {
      const res = await fetch("/api/producao/planejamento/gerar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: amanha.toISOString() }),
      });
      if (res.ok) await refresh();
    } finally {
      setLoading(false);
    }
  }

  const totalItens = ordens.length;

  return (
    <div className="space-y-6">
      <Section
        title={amanha.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" })}
        action={
          canManage ? (
            <button
              onClick={gerarPlano}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-nord-blue hover:bg-nord-blue-light disabled:opacity-50 text-white font-medium"
            >
              {loading ? <RefreshCw size={13} className="animate-spin" /> : <Sparkles size={13} />} Gerar plano
            </button>
          ) : undefined
        }
      >
        {totalItens === 0 ? (
          <p className="text-sm text-nord-gray py-6 text-center">
            Nenhum plano gerado ainda para amanhã. Clique em &quot;Gerar plano&quot; para calcular a previsão com base nas
            vendas importadas.
          </p>
        ) : (
          <p className="text-sm text-nord-gray">{totalItens} produções previstas para amanhã.</p>
        )}
      </Section>

      {totalItens > 0 && (
        <div className="nord-card overflow-x-auto nord-scrollbar">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-nord-gray border-b border-nord-border">
                <th className="py-2 px-3">Produto</th>
                <th className="py-2 px-3">Necessidade prevista</th>
                <th className="py-2 px-3">Estoque pronto</th>
                <th className="py-2 px-3">Sugestão</th>
                <th className="py-2 px-3">Aprovado</th>
                <th className="py-2 px-3">Prioridade</th>
                {canManage && <th className="py-2 px-3" />}
              </tr>
            </thead>
            <tbody>
              {ordens.map((o) => (
                <tr key={o.id} className="border-b border-nord-border/50">
                  <td className="py-2 px-3 text-white">
                    <span className="flex items-center gap-1.5">
                      <DynamicIcon name={o.productionItem.category.icon} size={14} style={{ color: o.productionItem.category.color }} />
                      {o.productionItem.name}
                    </span>
                  </td>
                  <td className="py-2 px-3 text-nord-gray">
                    {o.necessidadePrevista.toFixed(1)} {o.productionItem.unidade}
                  </td>
                  <td className="py-2 px-3 text-nord-gray">
                    {o.estoqueProntoSnapshot.toFixed(1)} {o.productionItem.unidade}
                  </td>
                  <td className="py-2 px-3 text-white font-medium">
                    {o.quantidadeSugerida.toFixed(1)} {o.productionItem.unidade}
                  </td>
                  <td className="py-2 px-3">
                    {o.quantidadeAprovada !== null ? (
                      <Badge tone="warning">
                        {o.quantidadeAprovada.toFixed(1)} {o.productionItem.unidade}
                      </Badge>
                    ) : (
                      <span className="text-nord-gray">—</span>
                    )}
                  </td>
                  <td className="py-2 px-3">
                    <span className="text-xs font-medium" style={{ color: PRODUCTION_PRIORITY_COLOR[o.prioridade] }}>
                      {PRODUCTION_PRIORITY_LABEL[o.prioridade] ?? o.prioridade}
                    </span>
                  </td>
                  {canManage && (
                    <td className="py-2 px-3">
                      <button onClick={() => setAjustando(o)} className="text-xs text-nord-blue-light hover:underline">
                        Ajustar
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {ajustando && (
        <AjusteModal
          ordem={ajustando}
          onClose={() => setAjustando(null)}
          onDone={() => {
            setAjustando(null);
            refresh();
          }}
        />
      )}
    </div>
  );
}
