"use client";

import { useState } from "react";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer, Legend } from "recharts";
import { StatCard, Section, Badge } from "@/components/ui/stat-card";
import { Modal } from "@/components/ui/modal";
import { formatCurrency, formatNumber, formatPercent } from "@/lib/calc";
import { format } from "date-fns";
import { STOCK_MOVEMENT_LABEL } from "@/lib/estoque";

type CriticoItem = { id: string; name: string; estoqueAtual: number; estoqueMinimo: number; unidade: string };
type ZeradoItem = { id: string; name: string; unidade: string };
type VencimentoItem = { id: string; name: string; validade: string };
type ConsumoItem = { id: string; name: string; consumo: number; unidade: string };
type SimpleItem = { id: string; name: string };

export function EstoqueDashboardClient({
  valorTotalEstoque,
  totalProdutos,
  critico,
  zerados,
  proximosVencimento,
  consumoAnormal,
  semCusto,
  semFicha,
  entradasCount,
  saidasCount,
  valorEntradas,
  valorSaidas,
  movementsByType,
  periodDays,
  cmvRealPercent,
  cmvTeoricoPercent,
  metaCmvPercent,
  diferencaPP,
  diferencaFinanceira,
  valorCompras,
  valorPerdas,
  contagensPendentes,
  divergenciasAbertas,
  evolucaoCmv,
  alertas,
}: {
  valorTotalEstoque: number;
  totalProdutos: number;
  critico: CriticoItem[];
  zerados: ZeradoItem[];
  proximosVencimento: VencimentoItem[];
  consumoAnormal: ConsumoItem[];
  semCusto: SimpleItem[];
  semFicha: SimpleItem[];
  entradasCount: number;
  saidasCount: number;
  valorEntradas: number;
  valorSaidas: number;
  movementsByType: { type: string; count: number }[];
  periodDays: number;
  cmvRealPercent: number;
  cmvTeoricoPercent: number;
  metaCmvPercent: number;
  diferencaPP: number;
  diferencaFinanceira: number;
  valorCompras: number;
  valorPerdas: number;
  contagensPendentes: number;
  divergenciasAbertas: number;
  evolucaoCmv: { periodo: string; meta: number; teorico: number; real: number }[];
  alertas: { label: string; tone: "warning" | "danger" }[];
}) {
  const [openAlert, setOpenAlert] = useState<"critico" | "zerados" | "vencimento" | "consumo" | "semCusto" | "semFicha" | null>(null);
  const dentroDaMeta = cmvRealPercent <= metaCmvPercent;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="CMV Real do período" value={formatPercent(cmvRealPercent)} icon="Warehouse" color={dentroDaMeta ? "#22c55e" : "#ef4444"} />
        <StatCard label="Meta de CMV" value={formatPercent(metaCmvPercent)} icon="Target" />
        <StatCard label="CMV Teórico" value={formatPercent(cmvTeoricoPercent)} icon="Calculator" color="#2952E3" />
        <StatCard
          label="Diferença Real x Teórico"
          value={`${diferencaPP >= 0 ? "+" : ""}${diferencaPP.toFixed(1)} p.p.`}
          icon={Math.abs(diferencaPP) > 3 ? "TriangleAlert" : "CheckCircle2"}
          color={Math.abs(diferencaPP) > 3 ? "#ef4444" : "#22c55e"}
          hint={formatCurrency(diferencaFinanceira)}
        />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Valor atual do estoque" value={formatCurrency(valorTotalEstoque)} icon="Boxes" />
        <StatCard label={`Compras (${periodDays}d)`} value={formatCurrency(valorCompras)} icon="ShoppingBasket" color="#22c55e" />
        <StatCard label={`Perdas registradas (${periodDays}d)`} value={formatCurrency(valorPerdas)} icon="TriangleAlert" color="#ef4444" />
        <StatCard label="Produtos cadastrados" value={String(totalProdutos)} icon="Package" />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <button onClick={() => setOpenAlert("critico")} className="text-left">
          <StatCard label="Abaixo do estoque mínimo" value={String(critico.length)} icon="TriangleAlert" color="#f59e0b" />
        </button>
        <button onClick={() => setOpenAlert("semCusto")} className="text-left">
          <StatCard label="Sem custo atualizado" value={String(semCusto.length)} icon="CircleDollarSign" color="#f59e0b" />
        </button>
        <button onClick={() => setOpenAlert("semFicha")} className="text-left">
          <StatCard label="Sem ficha técnica" value={String(semFicha.length)} icon="ClipboardX" color="#ef4444" />
        </button>
        <StatCard label="Contagens pendentes" value={String(contagensPendentes)} icon="ClipboardCheck" color={contagensPendentes ? "#f59e0b" : "#22c55e"} />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <button onClick={() => setOpenAlert("zerados")} className="text-left">
          <StatCard label="Produtos zerados" value={String(zerados.length)} icon="CircleSlash" color="#ef4444" />
        </button>
        <button onClick={() => setOpenAlert("vencimento")} className="text-left">
          <StatCard label="Próximos do vencimento" value={String(proximosVencimento.length)} icon="CalendarClock" color="#ef4444" />
        </button>
        <button onClick={() => setOpenAlert("consumo")} className="text-left">
          <StatCard label="Consumo anormal" value={String(consumoAnormal.length)} icon="TrendingUp" color="#f59e0b" />
        </button>
        <StatCard label="Divergências sem justificativa" value={String(divergenciasAbertas)} icon="AlertOctagon" color={divergenciasAbertas ? "#ef4444" : "#22c55e"} />
      </div>

      <Section title="Evolução do CMV (últimas 8 semanas) — Meta x Teórico x Real">
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={evolucaoCmv}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--nord-border)" />
            <XAxis dataKey="periodo" stroke="var(--nord-gray)" fontSize={11} />
            <YAxis stroke="var(--nord-gray)" fontSize={11} tickFormatter={(v) => `${v}%`} />
            <Tooltip contentStyle={{ background: "var(--nord-card)", border: "1px solid var(--nord-border)", borderRadius: 8, fontSize: 12 }} formatter={(v) => `${v}%`} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Line type="monotone" dataKey="meta" name="Meta" stroke="#22c55e" strokeWidth={2} strokeDasharray="4 4" dot={false} />
            <Line type="monotone" dataKey="teorico" name="CMV Teórico" stroke="#2952E3" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="real" name="CMV Real" stroke="#eab308" strokeWidth={2} dot={{ r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
      </Section>

      {alertas.length > 0 && (
        <Section title="Alertas do período">
          <div className="space-y-2">
            {alertas.map((a, idx) => (
              <div key={idx} className="flex items-center justify-between text-sm border-b border-nord-border/60 pb-2 last:border-0">
                <span className="text-white">{a.label}</span>
                <Badge tone={a.tone}>{a.tone === "danger" ? "Crítico" : "Atenção"}</Badge>
              </div>
            ))}
          </div>
        </Section>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label={`Entradas (${periodDays}d)`} value={String(entradasCount)} icon="ArrowDownToLine" color="#22c55e" hint={formatCurrency(valorEntradas)} />
        <StatCard label={`Saídas (${periodDays}d)`} value={String(saidasCount)} icon="ArrowUpFromLine" color="#f59e0b" hint={formatCurrency(valorSaidas)} />
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

      <Modal open={openAlert === "critico"} onClose={() => setOpenAlert(null)} title="Abaixo do estoque mínimo" widthClass="max-w-md">
        <div className="space-y-2">
          {critico.map((i) => (
            <div key={i.id} className="flex items-center justify-between text-sm border-b border-nord-border/60 pb-2 last:border-0">
              <span className="text-white">{i.name}</span>
              <Badge tone="warning">
                {formatNumber(i.estoqueAtual)} / mín. {formatNumber(i.estoqueMinimo)} {i.unidade}
              </Badge>
            </div>
          ))}
          {critico.length === 0 && <p className="text-sm text-nord-gray text-center py-4">Nenhum produto em estoque crítico.</p>}
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
          {zerados.length === 0 && <p className="text-sm text-nord-gray text-center py-4">Nenhum produto zerado.</p>}
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
          {proximosVencimento.length === 0 && <p className="text-sm text-nord-gray text-center py-4">Nenhum produto próximo do vencimento.</p>}
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

      <Modal open={openAlert === "semCusto"} onClose={() => setOpenAlert(null)} title="Produtos sem custo atualizado" widthClass="max-w-md">
        <div className="space-y-2">
          {semCusto.map((i) => (
            <div key={i.id} className="flex items-center justify-between text-sm border-b border-nord-border/60 pb-2 last:border-0">
              <span className="text-white">{i.name}</span>
              <Badge tone="warning">Sem custo</Badge>
            </div>
          ))}
          {semCusto.length === 0 && <p className="text-sm text-nord-gray text-center py-4">Todos os produtos têm custo cadastrado.</p>}
        </div>
      </Modal>

      <Modal open={openAlert === "semFicha"} onClose={() => setOpenAlert(null)} title="Itens do cardápio sem ficha técnica" widthClass="max-w-md">
        <div className="space-y-2">
          {semFicha.map((i) => (
            <div key={i.id} className="flex items-center justify-between text-sm border-b border-nord-border/60 pb-2 last:border-0">
              <span className="text-white">{i.name}</span>
              <Badge tone="danger">Sem ficha</Badge>
            </div>
          ))}
          {semFicha.length === 0 && <p className="text-sm text-nord-gray text-center py-4">Todos os itens têm ficha técnica.</p>}
        </div>
      </Modal>
    </div>
  );
}
