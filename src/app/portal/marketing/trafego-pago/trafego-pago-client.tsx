"use client";

import { useMemo, useState } from "react";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { StatCard, Section, Badge } from "@/components/ui/stat-card";
import { SortableStatCards } from "@/components/ui/sortable-stat-cards";
import { Modal, ConfirmDialog } from "@/components/ui/modal";
import { DynamicIcon } from "@/components/dynamic-icon";
import { classifyKpi, formatCurrency, formatNumber, formatPercent, growth, pct, safeDiv } from "@/lib/calc";
import { format } from "date-fns";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
} from "recharts";
import type { MetaAdsInsightSummary } from "@/lib/meta-ads-insights";

type MarketingEntryDTO = {
  id: string;
  date: string;
  investimentoTrafego: number;
  receitaTrafego: number;
  pedidosCampanha: number;
  visitasSite: number;
  conversoes: number;
  seguidoresInicio: number;
  seguidoresFim: number;
  curtidas: number;
  comentarios: number;
  compartilhamentos: number;
  salvamentos: number;
  alcance: number;
  impressoes: number;
  observacoes: string | null;
  planoDeAcao: string | null;
  createdBy: { name: string } | null;
};

const emptyForm = {
  date: format(new Date(), "yyyy-MM-dd"),
  investimentoTrafego: "",
  receitaTrafego: "",
  pedidosCampanha: "",
  visitasSite: "",
  conversoes: "",
  seguidoresInicio: "",
  seguidoresFim: "",
  curtidas: "",
  comentarios: "",
  compartilhamentos: "",
  salvamentos: "",
  alcance: "",
  impressoes: "",
  observacoes: "",
  planoDeAcao: "",
};

const TABS = [
  { key: "geral", label: "Visão geral", icon: "LayoutDashboard" },
  { key: "meta-ads", label: "Meta Ads", icon: "Megaphone" },
  { key: "google-ads", label: "Google Ads", icon: "Search" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

export function TrafegoPagoClient({
  initialEntries,
  canCreate = true,
  metaAdsSummary,
}: {
  initialEntries: MarketingEntryDTO[];
  canCreate?: boolean;
  metaAdsSummary: MetaAdsInsightSummary;
}) {
  const [tab, setTab] = useState<TabKey>("geral");
  const [entries, setEntries] = useState(initialEntries);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<MarketingEntryDTO | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const current = entries[0];
  const previous = entries[1];

  const roas = current ? safeDiv(current.receitaTrafego, current.investimentoTrafego) : 0;
  const taxaConversao = current ? pct(current.conversoes, current.visitasSite) : 0;
  const totalInteracoes = current
    ? current.curtidas + current.comentarios + current.compartilhamentos + current.salvamentos
    : 0;
  const taxaEngajamento = current ? pct(totalInteracoes, current.alcance || current.seguidoresFim) : 0;

  const prevRoas = previous ? safeDiv(previous.receitaTrafego, previous.investimentoTrafego) : 0;

  const roasClass = classifyKpi(roas, { ruim: 1.5, regular: 2.5, bom: 4 });
  const conversaoClass = classifyKpi(taxaConversao, { ruim: 1, regular: 2, bom: 4 });
  const engajamentoClass = classifyKpi(taxaEngajamento, { ruim: 1, regular: 2, bom: 4 });

  const chartData = useMemo(
    () =>
      [...entries]
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
        .map((e) => ({
          date: format(new Date(e.date), "MM/yyyy"),
          ROAS: Number(safeDiv(e.receitaTrafego, e.investimentoTrafego).toFixed(2)),
          "Conversão %": Number(pct(e.conversoes, e.visitasSite).toFixed(2)),
        })),
    [entries]
  );

  function openNew() {
    setEditing(null);
    setForm(emptyForm);
    setShowForm(true);
  }

  function openEdit(entry: MarketingEntryDTO) {
    setEditing(entry);
    setForm({
      date: format(new Date(entry.date), "yyyy-MM-dd"),
      investimentoTrafego: String(entry.investimentoTrafego),
      receitaTrafego: String(entry.receitaTrafego),
      pedidosCampanha: String(entry.pedidosCampanha),
      visitasSite: String(entry.visitasSite),
      conversoes: String(entry.conversoes),
      seguidoresInicio: String(entry.seguidoresInicio),
      seguidoresFim: String(entry.seguidoresFim),
      curtidas: String(entry.curtidas),
      comentarios: String(entry.comentarios),
      compartilhamentos: String(entry.compartilhamentos),
      salvamentos: String(entry.salvamentos),
      alcance: String(entry.alcance),
      impressoes: String(entry.impressoes),
      observacoes: entry.observacoes ?? "",
      planoDeAcao: entry.planoDeAcao ?? "",
    });
    setShowForm(true);
  }

  async function refresh() {
    const res = await fetch("/api/marketing");
    const data = await res.json();
    setEntries(data.entries);
  }

  async function submit() {
    if (editing) {
      await fetch(`/api/marketing/${editing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
    } else {
      await fetch("/api/marketing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
    }
    setShowForm(false);
    refresh();
  }

  async function doDelete() {
    if (!confirmDeleteId) return;
    await fetch(`/api/marketing/${confirmDeleteId}`, { method: "DELETE" });
    setConfirmDeleteId(null);
    refresh();
  }

  const fields: [string, keyof typeof emptyForm][] = [
    ["Investimento em tráfego (R$)", "investimentoTrafego"],
    ["Receita gerada (R$)", "receitaTrafego"],
    ["Pedidos originados", "pedidosCampanha"],
    ["Visitas ao site", "visitasSite"],
    ["Conversões", "conversoes"],
    ["Seguidores início", "seguidoresInicio"],
    ["Seguidores fim", "seguidoresFim"],
    ["Curtidas", "curtidas"],
    ["Comentários", "comentarios"],
    ["Compartilhamentos", "compartilhamentos"],
    ["Salvamentos", "salvamentos"],
    ["Alcance", "alcance"],
    ["Impressões", "impressoes"],
  ];

  return (
    <div className="space-y-6">
      <nav className="flex flex-wrap gap-2" aria-label="Seções de Tráfego Pago">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium text-white transition-colors ${
              tab === t.key ? "border-nord-blue bg-nord-blue" : "border-nord-border hover:border-nord-blue/60"
            }`}
          >
            <DynamicIcon name={t.icon} size={14} />
            {t.label}
          </button>
        ))}
      </nav>

      {tab === "geral" && (
        <>
      {!canCreate && (
        <p className="text-xs text-amber-400 bg-amber-950/20 border border-amber-900/40 rounded-lg px-3 py-2">
          Você está no modo Grupo Nord (consolidado). Selecione uma loja específica no menu lateral para lançar
          ou editar dados.
        </p>
      )}
      {canCreate && (
        <div className="flex justify-end">
          <button
            onClick={openNew}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-nord-blue hover:bg-nord-blue-light text-white font-medium"
          >
            <Plus size={13} /> Novo período de marketing
          </button>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
        <div className="nord-card p-4">
          <p className="text-xs text-nord-gray mb-1">ROAS tráfego pago</p>
          <p className="text-white text-xl font-semibold mb-2">{formatNumber(roas, 2)}x</p>
          <Badge tone={roasClass.tone}>{roasClass.label}</Badge>
        </div>
        <div className="nord-card p-4">
          <p className="text-xs text-nord-gray mb-1">Taxa de conversão</p>
          <p className="text-white text-xl font-semibold mb-2">{formatPercent(taxaConversao)}</p>
          <Badge tone={conversaoClass.tone}>{conversaoClass.label}</Badge>
        </div>
        <div className="nord-card p-4">
          <p className="text-xs text-nord-gray mb-1">Taxa de engajamento</p>
          <p className="text-white text-xl font-semibold mb-2">{formatPercent(taxaEngajamento)}</p>
          <Badge tone={engajamentoClass.tone}>{engajamentoClass.label}</Badge>
        </div>
        <StatCard label="Visitas ao site" value={formatNumber(current?.visitasSite ?? 0)} icon="MousePointerClick" />
        <StatCard
          label="Seguidores"
          value={formatNumber(current?.seguidoresFim ?? 0)}
          icon="Users"
          delta={growth(roas, prevRoas)}
        />
      </div>

      <Section title="Evolução mensal — ROAS e Conversão">
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2e" />
            <XAxis dataKey="date" stroke="#9a9aa2" fontSize={11} />
            <YAxis stroke="#9a9aa2" fontSize={11} />
            <Tooltip contentStyle={{ background: "#1a1a1d", border: "1px solid #2a2a2e", borderRadius: 8 }} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Line type="monotone" dataKey="ROAS" stroke="#2952E3" strokeWidth={2} />
            <Line type="monotone" dataKey="Conversão %" stroke="#a855f7" strokeWidth={2} />
          </LineChart>
        </ResponsiveContainer>
      </Section>

      <Section title="Histórico de lançamentos">
        <div className="overflow-x-auto nord-scrollbar">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-nord-gray border-b border-nord-border">
                <th className="py-2 pr-4">Período</th>
                <th className="py-2 pr-4">Investimento</th>
                <th className="py-2 pr-4">Receita</th>
                <th className="py-2 pr-4">ROAS</th>
                <th className="py-2 pr-4">Conversão</th>
                <th className="py-2 pr-4"></th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id} className="border-b border-nord-border/50 hover:bg-white/5">
                  <td className="py-2 pr-4 text-white">{format(new Date(e.date), "MM/yyyy")}</td>
                  <td className="py-2 pr-4 text-nord-gray">{formatCurrency(e.investimentoTrafego)}</td>
                  <td className="py-2 pr-4 text-nord-gray">{formatCurrency(e.receitaTrafego)}</td>
                  <td className="py-2 pr-4 text-nord-gray">
                    {formatNumber(safeDiv(e.receitaTrafego, e.investimentoTrafego), 2)}x
                  </td>
                  <td className="py-2 pr-4 text-nord-gray">{formatPercent(pct(e.conversoes, e.visitasSite))}</td>
                  <td className="py-2 pr-4">
                    {canCreate && (
                      <div className="flex items-center gap-2 justify-end">
                        <button onClick={() => openEdit(e)} className="text-nord-gray hover:text-white">
                          <Pencil size={14} />
                        </button>
                        <button onClick={() => setConfirmDeleteId(e.id)} className="text-nord-gray hover:text-red-400">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
        </>
      )}

      {tab === "meta-ads" && <MetaAdsView summary={metaAdsSummary} />}

      {tab === "google-ads" && (
        <div className="nord-card p-6 text-center">
          <DynamicIcon name="Search" size={28} className="text-nord-gray mx-auto mb-3" />
          <p className="text-white text-sm font-medium mb-1">Google Ads ainda não está conectado</p>
          <p className="text-xs text-nord-gray max-w-md mx-auto">
            O Portal ainda não tem uma integração automática com o Google Ads. Assim que ela existir, os dados reais de
            campanhas aparecem aqui, do mesmo jeito que já acontece com o Meta Ads.
          </p>
        </div>
      )}

      <Modal
        open={showForm}
        onClose={() => setShowForm(false)}
        title={editing ? "Editar lançamento de marketing" : "Novo lançamento de marketing"}
        widthClass="max-w-2xl"
      >
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="block text-xs text-nord-gray mb-1">Data (referência do mês)</span>
            <input
              type="date"
              value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
              className="input"
            />
          </label>
          {fields.map(([label, key]) => (
            <label key={key} className="block">
              <span className="block text-xs text-nord-gray mb-1">{label}</span>
              <input
                type="number"
                value={form[key]}
                onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                className="input"
              />
            </label>
          ))}
          <div className="col-span-2">
            <label className="block">
              <span className="block text-xs text-nord-gray mb-1">Observações</span>
              <textarea
                value={form.observacoes}
                onChange={(e) => setForm({ ...form, observacoes: e.target.value })}
                className="input min-h-14"
              />
            </label>
          </div>
          <div className="col-span-2">
            <label className="block">
              <span className="block text-xs text-nord-gray mb-1">Plano de ação</span>
              <textarea
                value={form.planoDeAcao}
                onChange={(e) => setForm({ ...form, planoDeAcao: e.target.value })}
                className="input min-h-14"
              />
            </label>
          </div>
        </div>
        <button
          onClick={submit}
          className="w-full mt-4 bg-nord-blue hover:bg-nord-blue-light text-white text-sm font-medium rounded-lg py-2.5"
        >
          Salvar
        </button>
      </Modal>

      <ConfirmDialog
        open={!!confirmDeleteId}
        title="Excluir lançamento"
        message="Tem certeza que deseja excluir este lançamento de marketing?"
        onConfirm={doDelete}
        onCancel={() => setConfirmDeleteId(null)}
        confirmLabel="Excluir"
        danger
      />

      <style jsx global>{`
        .input {
          width: 100%;
          background: var(--nord-panel);
          border: 1px solid var(--nord-border);
          border-radius: 8px;
          padding: 8px 12px;
          color: white;
          font-size: 13px;
          outline: none;
        }
        .input:focus {
          border-color: var(--nord-blue);
        }
      `}</style>
    </div>
  );
}

/**
 * Dados reais das campanhas do Meta Ads (Facebook + Instagram Ads), vindos
 * dos insights já sincronizados via a integração (Configurações > Meta Ads).
 * Últimos 30 dias, comparados com os 30 dias anteriores.
 */
function MetaAdsView({ summary }: { summary: MetaAdsInsightSummary }) {
  if (!summary.connected) {
    return (
      <div className="nord-card p-6 text-center">
        <DynamicIcon name="Megaphone" size={28} className="text-nord-gray mx-auto mb-3" />
        <p className="text-white text-sm font-medium mb-1">Meta Ads ainda não sincronizou dados</p>
        <p className="text-xs text-nord-gray max-w-md mx-auto">
          Conecte a conta de anúncios em Configurações &gt; Meta Ads e rode a sincronização — os dados reais das
          campanhas (impressões, cliques, investimento, ROAS) aparecem aqui automaticamente depois disso.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <p className="text-xs text-nord-gray">Últimos 30 dias, comparado com os 30 dias anteriores. Dados reais das campanhas do Meta Ads.</p>
      <SortableStatCards
        storageKey="trafego-pago-meta-ads-kpi-order"
        className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4"
        cards={[
          {
            key: "valor-investido",
            label: "Valor investido",
            value: formatCurrency(summary.valorInvestido),
            icon: "Wallet",
            color: "#f59e0b",
            delta: growth(summary.valorInvestido, summary.anterior.valorInvestido),
          },
          {
            key: "valor-compras",
            label: "Valor das compras",
            value: formatCurrency(summary.valorCompras),
            icon: "DollarSign",
            color: "#22c55e",
            delta: growth(summary.valorCompras, summary.anterior.valorCompras),
          },
          { key: "roas", label: "ROAS", value: `${formatNumber(summary.roas, 2)}x`, icon: "TrendingUp", color: "#22c55e" },
          {
            key: "custo-por-compra",
            label: "Custo por compra",
            value: formatCurrency(summary.custoPorCompra),
            icon: "Receipt",
            color: "#ef4444",
          },
          {
            key: "impressoes",
            label: "Impressões",
            value: formatNumber(summary.impressoes),
            icon: "Eye",
            color: "#1464F4",
            delta: growth(summary.impressoes, summary.anterior.impressoes),
          },
          {
            key: "alcance",
            label: "Alcance",
            value: formatNumber(summary.alcance),
            icon: "Radar",
            color: "#a855f7",
            delta: growth(summary.alcance, summary.anterior.alcance),
          },
          { key: "ctr", label: "CTR (cliques no link)", value: formatPercent(summary.ctr), icon: "MousePointerClick", color: "#f59e0b" },
          { key: "cpc", label: "CPC médio", value: formatCurrency(summary.cpc), icon: "DollarSign", color: "#ef4444" },
          {
            key: "cliques-link",
            label: "Cliques no link",
            value: formatNumber(summary.cliquesLink),
            icon: "MousePointerClick",
            color: "#1464F4",
            delta: growth(summary.cliquesLink, summary.anterior.cliquesLink),
          },
          { key: "cliques-facebook", label: "Cliques no link — Facebook", value: formatNumber(summary.cliquesLinkFacebook), icon: "Megaphone", color: "#3b82f6" },
          { key: "cliques-instagram", label: "Cliques no link — Instagram", value: formatNumber(summary.cliquesLinkInstagram), icon: "Camera", color: "#a855f7" },
          {
            key: "compras",
            label: "Compras",
            value: formatNumber(summary.compras),
            icon: "ShoppingBag",
            color: "#22c55e",
            delta: growth(summary.compras, summary.anterior.compras),
          },
        ]}
      />
    </div>
  );
}
