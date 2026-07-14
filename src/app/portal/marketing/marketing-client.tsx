"use client";

import { useMemo, useState } from "react";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { StatCard, Section, Badge } from "@/components/ui/stat-card";
import { Modal, ConfirmDialog } from "@/components/ui/modal";
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
  createdBy: { name: string };
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

export function MarketingClient({ initialEntries }: { initialEntries: MarketingEntryDTO[] }) {
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
      <div className="flex justify-end">
        <button
          onClick={openNew}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-nord-blue hover:bg-nord-blue-light text-white font-medium"
        >
          <Plus size={13} /> Novo período de marketing
        </button>
      </div>

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
                    <div className="flex items-center gap-2 justify-end">
                      <button onClick={() => openEdit(e)} className="text-nord-gray hover:text-white">
                        <Pencil size={14} />
                      </button>
                      <button onClick={() => setConfirmDeleteId(e.id)} className="text-nord-gray hover:text-red-400">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

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
