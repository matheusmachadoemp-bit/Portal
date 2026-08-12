"use client";

import { useState } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Cell,
  ScatterChart,
  Scatter,
} from "recharts";
import { Section, Badge } from "@/components/ui/stat-card";
import { formatCurrency, formatNumber, formatPercent } from "@/lib/calc";

type Produto = { nome: string; quantidade: number; compradores: number };
type ProdutoRecompra = { nome: string; taxaRecompra: number; compradores: number };
type ProdutoRecorrencia = { nome: string; pedidosMedios: number; compradores: number };
type CanalDist = { canal: string; clientes: number; receita: number };
type Dist = { label: string; count: number };
type Segmento = { segmento: string; tone: string; count: number; ticketMedio: number; ltv: number; frequenciaMedia: number | null };
type MatrizPonto = { id: string; nome: string; scoreR: number; scoreF: number; valor: number; segmento: string };
type RankingItem = { id: string; nome: string; totalGasto: number; pedidos: number; ticketMedio: number; ultimaCompra: string | null };

const SEGMENT_COLOR: Record<string, string> = {
  Campeões: "#22c55e",
  "Clientes fiéis": "#22c55e",
  "Grandes compradores": "#2952E3",
  "Potenciais fiéis": "#2952E3",
  "Clientes novos": "#3b6bf0",
  "Clientes promissores": "#9a9aa2",
  "Precisam de atenção": "#f59e0b",
  "Em risco": "#f59e0b",
  Hibernando: "#ef4444",
  Perdidos: "#6b7280",
};

const RANKING_PERIODS = [
  { key: "30dias", label: "30 dias" },
  { key: "90dias", label: "90 dias" },
  { key: "ano", label: "Ano" },
  { key: "historico", label: "Histórico" },
] as const;

const RANKING_SIZES = [10, 50, 100];

export function InteligenciaClient({
  topProdutos,
  produtosRecompra,
  produtosRecorrencia,
  canalDist,
  diaDist,
  horaDist,
  porSegmento,
  matriz,
  rankings,
}: {
  topProdutos: Produto[];
  produtosRecompra: ProdutoRecompra[];
  produtosRecorrencia: ProdutoRecorrencia[];
  canalDist: CanalDist[];
  diaDist: Dist[];
  horaDist: Dist[];
  porSegmento: Segmento[];
  matriz: MatrizPonto[];
  rankings: Record<(typeof RANKING_PERIODS)[number]["key"], RankingItem[]>;
}) {
  const [rankingPeriod, setRankingPeriod] = useState<(typeof RANKING_PERIODS)[number]["key"]>("historico");
  const [rankingSize, setRankingSize] = useState(10);

  const rankingRows = rankings[rankingPeriod].slice(0, rankingSize);
  const medals = ["🥇", "🥈", "🥉"];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Section title="Produtos mais comprados">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={topProdutos} layout="vertical" margin={{ left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2e" horizontal={false} />
              <XAxis type="number" stroke="#9a9aa2" fontSize={11} allowDecimals={false} />
              <YAxis type="category" dataKey="nome" stroke="#9a9aa2" fontSize={10} width={130} />
              <Tooltip contentStyle={{ background: "#1a1a1d", border: "1px solid #2a2a2e", borderRadius: 8 }} />
              <Bar dataKey="quantidade" name="Quantidade" fill="#2952E3" radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Section>

        <Section title="Produtos com maior taxa de recompra">
          <div className="space-y-2 max-h-[260px] overflow-y-auto nord-scrollbar">
            {produtosRecompra.map((p) => (
              <div key={p.nome} className="flex items-center justify-between text-sm">
                <span className="text-white truncate">{p.nome}</span>
                <span className="text-nord-blue-light font-medium">{formatPercent(p.taxaRecompra)}</span>
              </div>
            ))}
            {produtosRecompra.length === 0 && <p className="text-xs text-nord-gray text-center py-6">Dados insuficientes ainda.</p>}
          </div>
        </Section>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <Section title="Produtos que geram clientes recorrentes">
          <div className="space-y-2 max-h-[220px] overflow-y-auto nord-scrollbar">
            {produtosRecorrencia.map((p) => (
              <div key={p.nome} className="flex items-center justify-between text-sm">
                <span className="text-white truncate">{p.nome}</span>
                <span className="text-nord-gray">{formatNumber(p.pedidosMedios, 1)} pedidos/cliente</span>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Clientes por canal">
          <div className="space-y-3">
            {canalDist.map((c) => (
              <div key={c.canal}>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-nord-gray">{c.canal}</span>
                  <span className="text-white">{formatNumber(c.clientes)} clientes · {formatCurrency(c.receita)}</span>
                </div>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Dia e horário preferido">
          <div className="space-y-3">
            <div>
              <p className="text-[11px] text-nord-gray mb-1">Dia da semana</p>
              <ResponsiveContainer width="100%" height={90}>
                <BarChart data={diaDist}>
                  <XAxis dataKey="label" stroke="#9a9aa2" fontSize={9} interval={0} tick={{ fontSize: 9 }} />
                  <Bar dataKey="count" fill="#2952E3" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div>
              <p className="text-[11px] text-nord-gray mb-1">Horário</p>
              <ResponsiveContainer width="100%" height={90}>
                <BarChart data={horaDist}>
                  <XAxis dataKey="label" stroke="#9a9aa2" fontSize={9} interval={0} tick={{ fontSize: 9 }} />
                  <Bar dataKey="count" fill="#22c55e" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </Section>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Section title="Matriz RFM (Recência x Frequência)">
          <ResponsiveContainer width="100%" height={280}>
            <ScatterChart margin={{ left: 8, right: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2e" />
              <XAxis type="number" dataKey="scoreR" name="Recência" domain={[0, 6]} stroke="#9a9aa2" fontSize={11} tickCount={6} />
              <YAxis type="number" dataKey="scoreF" name="Frequência" domain={[0, 6]} stroke="#9a9aa2" fontSize={11} tickCount={6} />
              <Tooltip
                cursor={{ strokeDasharray: "3 3" }}
                contentStyle={{ background: "#1a1a1d", border: "1px solid #2a2a2e", borderRadius: 8 }}
                formatter={(value, name) => [String(value), name]}
              />
              <Scatter data={matriz} fill="#2952E3">
                {matriz.map((m) => (
                  <Cell key={m.id} fill={SEGMENT_COLOR[m.segmento] ?? "#2952E3"} fillOpacity={0.7} />
                ))}
              </Scatter>
            </ScatterChart>
          </ResponsiveContainer>
          <p className="text-[11px] text-nord-gray mt-2">Eixo X: recência (5 = comprou recentemente) · Eixo Y: frequência (5 = compra com frequência)</p>
        </Section>

        <Section title="Métricas por segmento RFM">
          <div className="overflow-x-auto nord-scrollbar">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-nord-gray border-b border-nord-border">
                  <th className="py-2 pr-3">Segmento</th>
                  <th className="py-2 pr-3">Clientes</th>
                  <th className="py-2 pr-3">Ticket médio</th>
                  <th className="py-2 pr-3">LTV</th>
                  <th className="py-2 pr-3">Frequência</th>
                </tr>
              </thead>
              <tbody>
                {porSegmento.map((s) => (
                  <tr key={s.segmento} className="border-b border-nord-border/50">
                    <td className="py-2 pr-3">
                      <Badge tone={s.tone as never}>{s.segmento}</Badge>
                    </td>
                    <td className="py-2 pr-3 text-nord-gray">{formatNumber(s.count)}</td>
                    <td className="py-2 pr-3 text-nord-gray">{formatCurrency(s.ticketMedio)}</td>
                    <td className="py-2 pr-3 text-nord-gray">{formatCurrency(s.ltv)}</td>
                    <td className="py-2 pr-3 text-nord-gray">{s.frequenciaMedia !== null ? `${formatNumber(s.frequenciaMedia, 0)}d` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      </div>

      <Section
        title="Top Clientes"
        action={
          <div className="flex items-center gap-2 flex-wrap">
            {RANKING_PERIODS.map((p) => (
              <button
                key={p.key}
                onClick={() => setRankingPeriod(p.key)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-medium ${rankingPeriod === p.key ? "bg-nord-blue text-white" : "bg-white/5 text-nord-gray"}`}
              >
                {p.label}
              </button>
            ))}
            <span className="text-nord-gray/40">|</span>
            {RANKING_SIZES.map((s) => (
              <button
                key={s}
                onClick={() => setRankingSize(s)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-medium ${rankingSize === s ? "bg-nord-blue text-white" : "bg-white/5 text-nord-gray"}`}
              >
                Top {s}
              </button>
            ))}
          </div>
        }
      >
        <div className="overflow-x-auto nord-scrollbar">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-nord-gray border-b border-nord-border">
                <th className="py-2 pr-3">#</th>
                <th className="py-2 pr-3">Cliente</th>
                <th className="py-2 pr-3">Total gasto</th>
                <th className="py-2 pr-3">Pedidos</th>
                <th className="py-2 pr-3">Ticket médio</th>
                <th className="py-2 pr-3">Última compra</th>
              </tr>
            </thead>
            <tbody>
              {rankingRows.map((r, idx) => (
                <tr key={r.id} className="border-b border-nord-border/50 hover:bg-white/5">
                  <td className="py-2 pr-3 text-white">{medals[idx] ?? idx + 1}</td>
                  <td className="py-2 pr-3 text-white">{r.nome}</td>
                  <td className="py-2 pr-3 text-nord-gray">{formatCurrency(r.totalGasto)}</td>
                  <td className="py-2 pr-3 text-nord-gray">{r.pedidos}</td>
                  <td className="py-2 pr-3 text-nord-gray">{formatCurrency(r.ticketMedio)}</td>
                  <td className="py-2 pr-3 text-nord-gray">{r.ultimaCompra ? new Date(r.ultimaCompra).toLocaleDateString("pt-BR") : "—"}</td>
                </tr>
              ))}
              {rankingRows.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-nord-gray">
                    Nenhum dado disponível para este período.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  );
}
