"use client";

import { useState } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer } from "recharts";
import { StatCard, Section, Badge } from "@/components/ui/stat-card";
import { Modal } from "@/components/ui/modal";
import { formatCurrency, formatNumber } from "@/lib/calc";
import { format } from "date-fns";
import { STOCK_MOVEMENT_LABEL } from "@/lib/estoque";

type CriticoItem = { id: string; name: string; estoqueAtual: number; estoqueMinimo: number; unidade: string };
type ZeradoItem = { id: string; name: string; unidade: string };
type VencimentoItem = { id: string; name: string; validade: string };
type ConsumoItem = { id: string; name: string; consumo: number; unidade: string };

export function EstoqueDashboardClient({
  valorTotalEstoque,
  totalProdutos,
  critico,
  zerados,
  proximosVencimento,
  consumoAnormal,
  entradasCount,
  saidasCount,
  valorEntradas,
  valorSaidas,
  movementsByType,
  periodDays,
}: {
  valorTotalEstoque: number;
  totalProdutos: number;
  critico: CriticoItem[];
  zerados: ZeradoItem[];
  proximosVencimento: VencimentoItem[];
  consumoAnormal: ConsumoItem[];
  entradasCount: number;
  saidasCount: number;
  valorEntradas: number;
  valorSaidas: number;
  movementsByType: { type: string; count: number }[];
  periodDays: number;
}) {
  const [openAlert, setOpenAlert] = useState<"critico" | "zerados" | "vencimento" | "consumo" | null>(null);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Valor total do estoque" value={formatCurrency(valorTotalEstoque)} icon="Warehouse" color="#2952E3" />
        <StatCard label="Quantidade de produtos" value={String(totalProdutos)} icon="Boxes" />
        <StatCard label={`Entradas (${periodDays}d)`} value={String(entradasCount)} icon="ArrowDownToLine" color="#22c55e" hint={formatCurrency(valorEntradas)} />
        <StatCard label={`Saídas (${periodDays}d)`} value={String(saidasCount)} icon="ArrowUpFromLine" color="#f59e0b" hint={formatCurrency(valorSaidas)} />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <button onClick={() => setOpenAlert("critico")} className="text-left">
          <StatCard label="Estoque crítico" value={String(critico.length)} icon="TriangleAlert" color="#f59e0b" />
        </button>
        <button onClick={() => setOpenAlert("zerados")} className="text-left">
          <StatCard label="Produtos zerados" value={String(zerados.length)} icon="CircleSlash" color="#ef4444" />
        </button>
        <button onClick={() => setOpenAlert("vencimento")} className="text-left">
          <StatCard label="Próximos do vencimento" value={String(proximosVencimento.length)} icon="CalendarClock" color="#ef4444" />
        </button>
        <button onClick={() => setOpenAlert("consumo")} className="text-left">
          <StatCard label="Consumo anormal" value={String(consumoAnormal.length)} icon="TrendingUp" color="#f59e0b" />
        </button>
      </div>

      <Section title={`Movimentações por tipo (últimos ${periodDays} dias)`}>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={movementsByType.map((m) => ({ ...m, label: STOCK_MOVEMENT_LABEL[m.type as keyof typeof STOCK_MOVEMENT_LABEL] }))}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--nord-border)" />
            <XAxis dataKey="label" stroke="var(--nord-gray)" fontSize={12} />
            <YAxis stroke="var(--nord-gray)" fontSize={12} allowDecimals={false} />
            <Tooltip contentStyle={{ background: "var(--nord-card)", border: "1px solid var(--nord-border)", borderRadius: 8, fontSize: 12 }} />
            <Bar dataKey="count" fill="#2952E3" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </Section>

      <Modal open={openAlert === "critico"} onClose={() => setOpenAlert(null)} title="Estoque crítico" widthClass="max-w-md">
        <div className="space-y-2">
          {critico.map((i) => (
            <div key={i.id} className="flex items-center justify-between text-sm border-b border-nord-border/60 pb-2 last:border-0">
              <span className="text-white">{i.name}</span>
              <Badge tone="warning">
                {formatNumber(i.estoqueAtual)} / mín. {formatNumber(i.estoqueMinimo)} {i.unidade}
              </Badge>
            </div>
          ))}
          {critico.length === 0 && <p className="text-sm text-nord-gray text-center py-4">Nenhum insumo em estoque crítico.</p>}
        </div>
      </Modal>

      <Modal open={openAlert === "zerados"} onClose={() => setOpenAlert(null)} title="Produtos zerados" widthClass="max-w-md">
        <div className="space-y-2">
          {zerados.map((i) => (
            <div key={i.id} className="flex items-center justify-between text-sm border-b border-nord-border/60 pb-2 last:border-0">
              <span className="text-white">{i.name}</span>
              <Badge tone="danger">Zerado</Badge>
            </div>
          ))}
          {zerados.length === 0 && <p className="text-sm text-nord-gray text-center py-4">Nenhum insumo zerado.</p>}
        </div>
      </Modal>

      <Modal open={openAlert === "vencimento"} onClose={() => setOpenAlert(null)} title="Próximos do vencimento" widthClass="max-w-md">
        <div className="space-y-2">
          {proximosVencimento.map((i) => (
            <div key={i.id} className="flex items-center justify-between text-sm border-b border-nord-border/60 pb-2 last:border-0">
              <span className="text-white">{i.name}</span>
              <Badge tone="danger">{format(new Date(i.validade), "dd/MM/yyyy")}</Badge>
            </div>
          ))}
          {proximosVencimento.length === 0 && <p className="text-sm text-nord-gray text-center py-4">Nenhum insumo próximo do vencimento.</p>}
        </div>
      </Modal>

      <Modal open={openAlert === "consumo"} onClose={() => setOpenAlert(null)} title="Consumo anormal" widthClass="max-w-md">
        <div className="space-y-2">
          {consumoAnormal.map((i) => (
            <div key={i.id} className="flex items-center justify-between text-sm border-b border-nord-border/60 pb-2 last:border-0">
              <span className="text-white">{i.name}</span>
              <Badge tone="warning">
                {formatNumber(i.consumo)} {i.unidade} no período
              </Badge>
            </div>
          ))}
          {consumoAnormal.length === 0 && <p className="text-sm text-nord-gray text-center py-4">Nenhum consumo fora do padrão detectado.</p>}
        </div>
      </Modal>
    </div>
  );
}
