"use client";

import { AlertTriangle, ArrowRight, Award, Lightbulb, Medal, Trophy } from "lucide-react";
import Link from "next/link";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import { Section, Badge, ProgressBar } from "@/components/ui/stat-card";
import { DynamicIcon } from "@/components/dynamic-icon";
import { formatCurrency } from "@/lib/calc";

// Tela de teste — todos os valores abaixo são fictícios, só para validar o layout.

const META = { realizado: 238450, total: 365000, faltam: 126550, diasRestantes: 12, necessarioDia: 10546, projecao: 358200 };
const ritmo = { metaDiaria: 10546, metaSemanal: 73820, realizadoHoje: 12230, realizadoSemana: 77450, necessarioAteFimSemana: 48310 };

const alertas = [
  { icon: "TrendingDown", cor: "#ef4444", titulo: "CMV", valor: "30,4%", detalhe: "Meta ≤ 28%", nota: "2,4 p.p. acima da meta", tone: "danger" as const },
  { icon: "Wallet", cor: "#f59e0b", titulo: "Ticket médio", valor: "R$ 137", detalhe: "Meta R$ 150", nota: "R$ 13 abaixo da meta", tone: "warning" as const },
  { icon: "Bike", cor: "#22c55e", titulo: "Delivery", valor: "68% da meta", detalhe: "", nota: "Ritmo adequado", tone: "success" as const },
];

const conquistas = [
  { icon: "Trophy", titulo: "Meta semanal batida", detalhe: "Semana 1 — 107,5% da meta" },
  { icon: "Star", titulo: "Recorde de vendas", detalhe: "Sábado (06/09) — R$ 23.850" },
  { icon: "Medal", titulo: "Meta atingida", detalhe: "NPS — 94,2" },
];

const anel = [
  { label: "Faturamento", realizado: "R$ 238.450", meta: "R$ 365.000", percent: 65 },
  { label: "Salão", realizado: "R$ 92.300", meta: "R$ 150.000", percent: 62 },
  { label: "Delivery", realizado: "R$ 146.150", meta: "R$ 215.000", percent: 68 },
  { label: "Ticket médio", realizado: "R$ 137", meta: "R$ 150", percent: 91 },
  { label: "CMV", realizado: "30,4%", meta: "≤ 28%", percent: 108, invertido: true },
  { label: "Lucro", realizado: "15,8%", meta: "≥ 18%", percent: 88 },
  { label: "Clientes novos", realizado: "+18%", meta: "+25%", percent: 72 },
];

const chartData = [
  { dia: "01/09", meta: 12167, realizado: 13500, projecao: null },
  { dia: "05/09", meta: 60833, realizado: 64200, projecao: null },
  { dia: "10/09", meta: 121667, realizado: 118400, projecao: null },
  { dia: "15/09", meta: 182500, realizado: 175800, projecao: null },
  { dia: "20/09", meta: 243333, realizado: null, projecao: null },
  { dia: "25/09", meta: 304167, realizado: 238450, projecao: 238450 },
  { dia: "30/09", meta: 365000, realizado: null, projecao: 358200 },
];

const semanas = [
  { semana: "Semana 1 (01 a 07)", meta: 85000, realizado: 91400, resultado: "+7,5%", tone: "success" as const },
  { semana: "Semana 2 (08 a 14)", meta: 85000, realizado: 79800, resultado: "-6,1%", tone: "danger" as const },
  { semana: "Semana 3 (15 a 21)", meta: 90000, realizado: 43600, resultado: "48,4%", tone: "warning" as const },
  { semana: "Semana 4 (22 a 30)", meta: 105000, realizado: null, resultado: "—", tone: "default" as const },
];

const setores = [
  {
    nome: "Salão",
    icon: "UtensilsCrossed",
    principal: { label: "Faturamento", realizado: "R$ 92.300", meta: "R$ 150.000", percent: 62 },
    metricas: [
      { label: "Ticket médio", realizado: "R$ 137", meta: "R$ 150", percent: 91, ok: true },
      { label: "Bebidas", realizado: "R$ 12.850", meta: "R$ 18.000", percent: 71, ok: true },
      { label: "Sobremesas", realizado: "312", meta: "450", percent: 69, ok: true },
      { label: "Rodízios", realizado: "184", meta: "300", percent: 61, ok: true },
    ],
  },
  {
    nome: "Delivery",
    icon: "Bike",
    principal: { label: "Faturamento", realizado: "R$ 146.150", meta: "R$ 215.000", percent: 68 },
    metricas: [
      { label: "Pedidos", realizado: "1.842", meta: "2.600", percent: 71, ok: true },
      { label: "Ticket médio", realizado: "R$ 79,34", meta: "R$ 85", percent: 93, ok: true },
      { label: "Cancelamento", realizado: "1,8%", meta: "≤ 1,5%", percent: 120, ok: false },
      { label: "Tempo médio", realizado: "38 min", meta: "≤ 35 min", percent: 108, ok: false },
    ],
  },
  {
    nome: "Cozinha",
    icon: "ChefHat",
    principal: { label: "CMV", realizado: "30,4%", meta: "≤ 28%", percent: 108, invertido: true },
    metricas: [
      { label: "Desperdício", realizado: "2,1%", meta: "≤ 1,5%", percent: 140, ok: false },
      { label: "Tempo médio preparo", realizado: "18 min", meta: "≤ 15 min", percent: 120, ok: false },
      { label: "Qualidade (avaliações)", realizado: "93%", meta: "≥ 95%", percent: 98, ok: false },
    ],
  },
];

const garcons = [
  { nome: "Luana", realizado: 32800, meta: 35000 },
  { nome: "Cauã", realizado: 28400, meta: 35000 },
  { nome: "Gabriela", realizado: 26100, meta: 35000 },
  { nome: "Rafaella", realizado: 21050, meta: 35000 },
  { nome: "Sabrina", realizado: 17200, meta: 35000 },
];

function Ring({ percent, size = 78, stroke = 8, color }: { percent: number; size?: number; stroke?: number; color: string }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, percent));
  const offset = c - (clamped / 100) * c;
  return (
    <svg width={size} height={size}>
      <circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(255,255,255,0.08)" strokeWidth={stroke} fill="none" />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        stroke={color}
        strokeWidth={stroke}
        fill="none"
        strokeDasharray={c}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text x="50%" y="50%" textAnchor="middle" dominantBaseline="central" className="fill-white text-sm font-semibold">
        {Math.round(percent)}%
      </text>
    </svg>
  );
}

// Mesma convenção já usada no restante do sistema (ex: metas-overview-client.tsx):
// azul enquanto não bateu a meta, verde quando bate. Métricas "invertidas" (quanto
// menor, melhor — CMV, cancelamento, tempo) viram vermelho quando estouram o limite,
// igual ao card de Alertas.
function ringColor(percent: number, invertido?: boolean) {
  if (invertido) return percent <= 100 ? "#22c55e" : "#ef4444";
  return percent >= 100 ? "#22c55e" : "#2952E3";
}

export function MetasPreviewClient() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
        <div className="lg:col-span-1 nord-card p-5">
          <p className="text-xs text-nord-gray uppercase tracking-wide mb-2">Meta de faturamento — Setembro</p>
          <p className="text-2xl font-semibold text-white mb-3">
            {formatCurrency(META.realizado)} <span className="text-nord-gray text-base font-normal">/ {formatCurrency(META.total)}</span>
          </p>
          <div className="flex items-center gap-3 mb-4">
            <div className="flex-1">
              <ProgressBar percent={(META.realizado / META.total) * 100} color={ringColor((META.realizado / META.total) * 100)} />
            </div>
            <span className="text-white text-sm font-semibold shrink-0">{((META.realizado / META.total) * 100).toFixed(1)}%</span>
          </div>
          <div className="grid grid-cols-2 gap-3 text-xs">
            <InfoStat icon="DollarSign" label="Faltam" value={formatCurrency(META.faltam)} />
            <InfoStat icon="CalendarDays" label="Dias restantes" value={String(META.diasRestantes)} />
            <InfoStat icon="TrendingUp" label="Necessário / dia" value={formatCurrency(META.necessarioDia)} />
            <InfoStat icon="Gauge" label="Projeção atual" value={formatCurrency(META.projecao)} hint={`${((META.projecao / META.total) * 100).toFixed(1)}% da meta`} warn />
          </div>
        </div>

        <div className="nord-card p-5">
          <p className="text-sm text-white font-medium mb-3">Ritmo necessário</p>
          <div className="space-y-2.5">
            <RitmoRow icon="Flag" label="Meta diária" value={formatCurrency(ritmo.metaDiaria)} />
            <RitmoRow icon="CalendarRange" label="Meta semanal" value={formatCurrency(ritmo.metaSemanal)} />
            <RitmoRow icon="CheckCircle2" label="Realizado hoje" value={formatCurrency(ritmo.realizadoHoje)} good />
            <RitmoRow icon="TrendingUp" label="Realizado na semana" value={formatCurrency(ritmo.realizadoSemana)} good />
            <RitmoRow icon="AlertCircle" label="Necessário até dom." value={formatCurrency(ritmo.necessarioAteFimSemana)} />
          </div>
        </div>

        <div className="space-y-4">
          <div className="nord-card p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm text-white font-medium flex items-center gap-1.5">
                <AlertTriangle size={14} className="text-red-400" /> Alertas
              </p>
              <button className="text-xs text-nord-blue-light hover:underline">Ver todos</button>
            </div>
            <div className="space-y-2.5">
              {alertas.map((a) => (
                <div key={a.titulo} className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: `${a.cor}22` }}>
                    <DynamicIcon name={a.icon} size={15} style={{ color: a.cor }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs text-white font-medium">{a.titulo}</span>
                      <span className="text-xs text-white font-semibold">{a.valor}</span>
                    </div>
                    <p className={`text-[11px] ${a.tone === "success" ? "text-emerald-400" : a.tone === "warning" ? "text-amber-400" : "text-red-400"}`}>
                      {a.nota}
                    </p>
                  </div>
                </div>
              ))}
            </div>
            <Link
              href="/portal/tarefas"
              className="mt-4 flex items-center justify-between px-3 py-2 rounded-lg bg-nord-blue/10 hover:bg-nord-blue/20 text-nord-blue-light text-xs font-medium transition-colors"
            >
              Criar plano de ação <ArrowRight size={13} />
            </Link>
          </div>

          <div className="nord-card p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm text-white font-medium flex items-center gap-1.5">
                <Trophy size={14} className="text-nord-success" /> Conquistas do mês
              </p>
              <button className="text-xs text-nord-blue-light hover:underline">Ver todas</button>
            </div>
            <div className="space-y-2.5">
              {conquistas.map((c) => (
                <div key={c.titulo} className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-nord-success/15 flex items-center justify-center shrink-0">
                    <DynamicIcon name={c.icon} size={15} className="text-nord-success" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-white font-medium truncate">{c.titulo}</p>
                    <p className="text-[11px] text-nord-gray truncate">{c.detalhe}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3">
        {anel.map((a) => (
          <div key={a.label} className="nord-card p-4 flex flex-col items-center text-center gap-2">
            <Ring percent={a.percent} color={ringColor(a.percent, a.invertido)} />
            <p className="text-xs text-white font-medium">{a.label}</p>
            <p className="text-[11px] text-nord-gray">
              {a.realizado} / {a.meta}
            </p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="xl:col-span-2">
          <Section title="Meta x Realizado — Faturamento acumulado">
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2e" />
                <XAxis dataKey="dia" stroke="#9a9aa2" fontSize={11} />
                <YAxis stroke="#9a9aa2" fontSize={11} tickFormatter={(v) => `${Number(v) / 1000}k`} />
                <Tooltip
                  contentStyle={{ background: "#1a1a1d", border: "1px solid #2a2a2e", borderRadius: 8 }}
                  labelStyle={{ color: "#fff" }}
                  formatter={(v) => formatCurrency(Number(v))}
                />
                <Line type="monotone" dataKey="meta" name="Meta acumulada" stroke="#9a9aa2" strokeDasharray="5 4" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="realizado" name="Realizado acumulado" stroke="#2952E3" strokeWidth={2.5} connectNulls />
                <Line type="monotone" dataKey="projecao" name="Projeção atual" stroke="#f59e0b" strokeDasharray="2 3" strokeWidth={2} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </Section>
        </div>

        <Section title="Desempenho por semana" action={<button className="text-xs text-nord-blue-light hover:underline">Ver detalhes</button>}>
          <div className="space-y-2">
            {semanas.map((s) => (
              <div key={s.semana} className="flex items-center justify-between text-xs py-1.5 border-b border-nord-border/50 last:border-0">
                <span className="text-nord-gray">{s.semana}</span>
                <span className="text-white">{formatCurrency(s.realizado ?? 0)}</span>
                <Badge tone={s.tone}>{s.resultado}</Badge>
              </div>
            ))}
            <button className="w-full mt-2 text-xs text-nord-blue-light hover:underline text-center">Ver dias</button>
          </div>
        </Section>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="xl:col-span-2">
          <Section title="Metas por setor" action={<button className="text-xs text-nord-blue-light hover:underline">Ver todas</button>}>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {setores.map((s) => {
                const cor = ringColor(s.principal.percent, s.principal.invertido);
                return (
                <div key={s.nome} className="rounded-lg border border-nord-border p-3.5">
                  <div className="flex items-center gap-2 mb-2.5">
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: `${cor}22` }}>
                      <DynamicIcon name={s.icon} size={14} style={{ color: cor }} />
                    </div>
                    <p className="text-sm text-white font-medium">{s.nome}</p>
                  </div>
                  <p className="text-[11px] text-nord-gray mb-0.5">{s.principal.label}</p>
                  <p className="text-sm text-white font-semibold mb-1.5">
                    {s.principal.realizado} <span className="text-nord-gray font-normal">/ {s.principal.meta}</span>
                  </p>
                  <ProgressBar percent={s.principal.percent} color={cor} />
                  <div className="mt-3 space-y-1.5">
                    {s.metricas.map((m) => (
                      <div key={m.label} className="flex items-center justify-between text-[11px]">
                        <span className="text-nord-gray">{m.label}</span>
                        <span className={m.ok ? "text-white" : "text-red-400"}>
                          {m.realizado} / {m.meta}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
                );
              })}
            </div>
          </Section>
        </div>

        <Section title="Metas individuais — Garçons" action={<button className="text-xs text-nord-blue-light hover:underline">Ver ranking completo</button>}>
          <div className="space-y-2.5">
            {garcons.map((g, idx) => {
              const percent = (g.realizado / g.meta) * 100;
              return (
                <div key={g.nome} className="flex items-center gap-2.5">
                  <span className="w-5 text-center text-xs font-semibold text-nord-gray shrink-0">
                    {idx === 0 ? <Award size={13} className="text-amber-400 mx-auto" /> : idx + 1}
                  </span>
                  <div className="w-7 h-7 rounded-full bg-nord-blue/20 text-nord-blue-light text-[11px] font-semibold flex items-center justify-center shrink-0">
                    {g.nome[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs text-white font-medium truncate">{g.nome}</span>
                      <span className="text-[11px] text-nord-gray shrink-0">
                        {formatCurrency(g.realizado)} / {formatCurrency(g.meta)}
                      </span>
                    </div>
                    <ProgressBar percent={percent} color={ringColor(percent)} />
                  </div>
                  <span className="text-xs text-white font-semibold w-10 text-right shrink-0">{percent.toFixed(0)}%</span>
                </div>
              );
            })}
            <p className="text-[11px] text-nord-gray pt-1">Metas individuais configuradas para o mês de Setembro/2026.</p>
          </div>
        </Section>
      </div>

      <div className="nord-card p-4 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-amber-500/15 flex items-center justify-center shrink-0">
            <Lightbulb size={16} className="text-amber-400" />
          </div>
          <div>
            <p className="text-sm text-white font-medium">Dica: metas fora do ritmo exigem ação imediata.</p>
            <p className="text-xs text-nord-gray">Transforme os alertas em planos de ação no módulo de Tarefas.</p>
          </div>
        </div>
        <Link href="/portal/tarefas" className="btn-primary shrink-0">
          Ir para Tarefas <ArrowRight size={14} />
        </Link>
      </div>
    </div>
  );
}

function InfoStat({ icon, label, value, hint, warn }: { icon: string; label: string; value: string; hint?: string; warn?: boolean }) {
  return (
    <div className="flex items-start gap-2">
      <DynamicIcon name={icon} size={14} className="text-nord-gray mt-0.5 shrink-0" />
      <div className="min-w-0">
        <p className="text-nord-gray text-[11px]">{label}</p>
        <p className={`font-medium ${warn ? "text-amber-400" : "text-white"}`}>{value}</p>
        {hint && <p className="text-[10px] text-nord-gray">{hint}</p>}
      </div>
    </div>
  );
}

function RitmoRow({ icon, label, value, good }: { icon: string; label: string; value: string; good?: boolean }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="flex items-center gap-1.5 text-nord-gray">
        <DynamicIcon name={icon} size={13} className={good ? "text-emerald-400" : "text-nord-gray"} />
        {label}
      </span>
      <span className={`font-medium ${good ? "text-emerald-400" : "text-white"}`}>{value}</span>
    </div>
  );
}
