"use client";

import { useState } from "react";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { MarketingTabs } from "../marketing-tabs";
import { Modal, ConfirmDialog } from "@/components/ui/modal";
import { Badge } from "@/components/ui/stat-card";
import { formatCurrency, formatNumber, safeDiv } from "@/lib/calc";
import { CAMPAIGN_STATUS_OPTIONS } from "@/lib/marketing";
import { format, parseISO } from "date-fns";

type Campaign = {
  id: string;
  name: string;
  objective: string | null;
  startDate: string;
  endDate: string;
  budget: number;
  investimento: number;
  retorno: number;
  status: string;
  resultados: string | null;
  responsavelId: string | null;
  responsavel: { name: string } | null;
  empresa: { name: string; color: string };
  tasks: { id: string; status: string }[];
};

const emptyForm = {
  name: "",
  objective: "",
  startDate: format(new Date(), "yyyy-MM-dd"),
  endDate: format(new Date(), "yyyy-MM-dd"),
  budget: "",
  investimento: "",
  retorno: "",
  responsavelId: "",
  status: "PLANEJADA",
  resultados: "",
};

export function CampaignsClient({
  initialCampaigns,
  teamMembers,
  canCreate,
}: {
  initialCampaigns: Campaign[];
  teamMembers: { id: string; name: string }[];
  canCreate: boolean;
}) {
  const [campaigns, setCampaigns] = useState(initialCampaigns);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Campaign | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  async function refresh() {
    const res = await fetch("/api/marketing/campaigns");
    const data = await res.json();
    setCampaigns(data.campaigns);
  }

  function openNew() {
    setEditing(null);
    setForm(emptyForm);
    setShowForm(true);
  }

  function openEdit(c: Campaign) {
    setEditing(c);
    setForm({
      name: c.name,
      objective: c.objective ?? "",
      startDate: c.startDate.slice(0, 10),
      endDate: c.endDate.slice(0, 10),
      budget: String(c.budget),
      investimento: String(c.investimento),
      retorno: String(c.retorno),
      responsavelId: c.responsavelId ?? "",
      status: c.status,
      resultados: c.resultados ?? "",
    });
    setShowForm(true);
  }

  async function submit() {
    if (editing) {
      await fetch(`/api/marketing/campaigns/${editing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
    } else {
      await fetch("/api/marketing/campaigns", {
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
    await fetch(`/api/marketing/campaigns/${confirmDeleteId}`, { method: "DELETE" });
    setConfirmDeleteId(null);
    refresh();
  }

  return (
    <div className="space-y-6">
      <MarketingTabs />

      {canCreate && (
        <div className="flex justify-end">
          <button
            onClick={openNew}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-nord-blue hover:bg-nord-blue-light text-white font-medium"
          >
            <Plus size={13} /> Nova campanha
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {campaigns.map((c) => {
          const statusOpt = CAMPAIGN_STATUS_OPTIONS.find((s) => s.key === c.status);
          const roi = safeDiv(c.retorno - c.investimento, c.investimento || 1) * 100;
          return (
            <div key={c.id} className="nord-card p-4">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <h4 className="text-white font-medium text-sm">{c.name}</h4>
                  <p className="text-xs text-nord-gray">{c.empresa.name}</p>
                </div>
                <Badge tone={statusOpt?.tone ?? "default"}>{statusOpt?.label ?? c.status}</Badge>
              </div>
              {c.objective && <p className="text-xs text-nord-gray mb-2">{c.objective}</p>}
              <p className="text-xs text-nord-gray mb-3">
                {format(parseISO(c.startDate), "dd/MM/yyyy")} – {format(parseISO(c.endDate), "dd/MM/yyyy")}
              </p>
              <div className="grid grid-cols-3 gap-2 mb-3">
                <div>
                  <p className="text-[10px] text-nord-gray">Orçamento</p>
                  <p className="text-xs text-white font-medium">{formatCurrency(c.budget)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-nord-gray">Investido</p>
                  <p className="text-xs text-white font-medium">{formatCurrency(c.investimento)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-nord-gray">ROI</p>
                  <p className={`text-xs font-medium ${roi >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                    {formatNumber(roi, 1)}%
                  </p>
                </div>
              </div>
              <p className="text-[11px] text-nord-gray mb-3">
                {c.tasks.length} peça(s) vinculada(s) · {c.responsavel?.name ?? "Sem responsável"}
              </p>
              {canCreate && (
                <div className="flex items-center gap-3 justify-end">
                  <button onClick={() => openEdit(c)} className="text-nord-gray hover:text-white">
                    <Pencil size={14} />
                  </button>
                  <button onClick={() => setConfirmDeleteId(c.id)} className="text-nord-gray hover:text-red-400">
                    <Trash2 size={14} />
                  </button>
                </div>
              )}
            </div>
          );
        })}
        {campaigns.length === 0 && (
          <p className="text-sm text-nord-gray col-span-full text-center py-8">Nenhuma campanha cadastrada ainda.</p>
        )}
      </div>

      <Modal open={showForm} onClose={() => setShowForm(false)} title={editing ? "Editar campanha" : "Nova campanha"} widthClass="max-w-2xl">
        <div className="grid grid-cols-2 gap-3">
          <label className="block col-span-2">
            <span className="block text-xs text-nord-gray mb-1">Nome</span>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="input" />
          </label>
          <label className="block col-span-2">
            <span className="block text-xs text-nord-gray mb-1">Objetivo</span>
            <input value={form.objective} onChange={(e) => setForm({ ...form, objective: e.target.value })} className="input" />
          </label>
          <label className="block">
            <span className="block text-xs text-nord-gray mb-1">Início</span>
            <input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} className="input" />
          </label>
          <label className="block">
            <span className="block text-xs text-nord-gray mb-1">Fim</span>
            <input type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} className="input" />
          </label>
          <label className="block">
            <span className="block text-xs text-nord-gray mb-1">Orçamento (R$)</span>
            <input type="number" value={form.budget} onChange={(e) => setForm({ ...form, budget: e.target.value })} className="input" />
          </label>
          <label className="block">
            <span className="block text-xs text-nord-gray mb-1">Investido (R$)</span>
            <input type="number" value={form.investimento} onChange={(e) => setForm({ ...form, investimento: e.target.value })} className="input" />
          </label>
          <label className="block">
            <span className="block text-xs text-nord-gray mb-1">Retorno (R$)</span>
            <input type="number" value={form.retorno} onChange={(e) => setForm({ ...form, retorno: e.target.value })} className="input" />
          </label>
          <label className="block">
            <span className="block text-xs text-nord-gray mb-1">Status</span>
            <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className="input">
              {CAMPAIGN_STATUS_OPTIONS.map((s) => (
                <option key={s.key} value={s.key}>{s.label}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="block text-xs text-nord-gray mb-1">Responsável</span>
            <select value={form.responsavelId} onChange={(e) => setForm({ ...form, responsavelId: e.target.value })} className="input">
              <option value="">—</option>
              {teamMembers.map((u) => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
          </label>
          <label className="block col-span-2">
            <span className="block text-xs text-nord-gray mb-1">Resultados</span>
            <textarea value={form.resultados} onChange={(e) => setForm({ ...form, resultados: e.target.value })} className="input min-h-16" />
          </label>
        </div>
        <button
          onClick={submit}
          disabled={!form.name.trim()}
          className="w-full mt-4 bg-nord-blue hover:bg-nord-blue-light disabled:opacity-50 text-white text-sm font-medium rounded-lg py-2.5"
        >
          Salvar
        </button>
      </Modal>

      <ConfirmDialog
        open={!!confirmDeleteId}
        title="Excluir campanha"
        message="Tem certeza que deseja excluir esta campanha?"
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
