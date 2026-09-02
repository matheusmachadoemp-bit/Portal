"use client";

import { useMemo, useState } from "react";
import { Plus, Pencil, Trash2, Trophy } from "lucide-react";
import { Modal, ConfirmDialog } from "@/components/ui/modal";
import { StatCard } from "@/components/ui/stat-card";
import { formatCurrency, formatNumber, safeDiv } from "@/lib/calc";

type Partner = {
  id: string;
  nome: string;
  cupom: string;
  quantidadeUtilizada: number;
  vendas: number;
  gasto: number;
  observacoes: string | null;
  empresa: { name: string; color: string };
  createdBy: { name: string };
};

const emptyForm = {
  nome: "",
  cupom: "",
  quantidadeUtilizada: "",
  vendas: "",
  gasto: "",
  observacoes: "",
};

function retornoOf(p: { vendas: number; gasto: number }) {
  return p.vendas - p.gasto;
}

export function PartnersClient({
  initialPartners,
  canCreate,
}: {
  initialPartners: Partner[];
  canCreate: boolean;
}) {
  const [partners, setPartners] = useState(initialPartners);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Partner | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const ranking = useMemo(() => {
    return [...partners].sort((a, b) => retornoOf(b) - retornoOf(a));
  }, [partners]);

  const totals = useMemo(() => {
    const vendas = partners.reduce((sum, p) => sum + p.vendas, 0);
    const gasto = partners.reduce((sum, p) => sum + p.gasto, 0);
    const usos = partners.reduce((sum, p) => sum + p.quantidadeUtilizada, 0);
    return { vendas, gasto, retorno: vendas - gasto, usos };
  }, [partners]);

  async function refresh() {
    const res = await fetch("/api/marketing/partners");
    const data = await res.json();
    setPartners(data.partners);
  }

  function openNew() {
    setEditing(null);
    setForm(emptyForm);
    setShowForm(true);
  }

  function openEdit(p: Partner) {
    setEditing(p);
    setForm({
      nome: p.nome,
      cupom: p.cupom,
      quantidadeUtilizada: String(p.quantidadeUtilizada),
      vendas: String(p.vendas),
      gasto: String(p.gasto),
      observacoes: p.observacoes ?? "",
    });
    setShowForm(true);
  }

  async function submit() {
    if (editing) {
      await fetch(`/api/marketing/partners/${editing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
    } else {
      await fetch("/api/marketing/partners", {
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
    await fetch(`/api/marketing/partners/${confirmDeleteId}`, { method: "DELETE" });
    setConfirmDeleteId(null);
    refresh();
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Cupons usados" value={formatNumber(totals.usos)} icon="Ticket" />
        <StatCard label="Vendas geradas" value={formatCurrency(totals.vendas)} icon="TrendingUp" color="#22c55e" />
        <StatCard label="Gasto com parceiros" value={formatCurrency(totals.gasto)} icon="Wallet" color="#eab308" />
        <StatCard
          label="Retorno líquido"
          value={formatCurrency(totals.retorno)}
          icon="Trophy"
          color={totals.retorno >= 0 ? "#22c55e" : "#ef4444"}
        />
      </div>

      {canCreate && (
        <div className="flex justify-end">
          <button
            onClick={openNew}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-nord-blue hover:bg-nord-blue-light text-white font-medium"
          >
            <Plus size={13} /> Novo parceiro
          </button>
        </div>
      )}

      <div className="nord-card overflow-x-auto nord-scrollbar">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-nord-gray border-b border-nord-border">
              <th className="py-3 px-4">#</th>
              <th className="py-3 px-4">Nome</th>
              <th className="py-3 px-4">Cupom</th>
              <th className="py-3 px-4">Qtd. utilizada</th>
              <th className="py-3 px-4">Vendas</th>
              <th className="py-3 px-4">Gasto</th>
              <th className="py-3 px-4">Retorno</th>
              <th className="py-3 px-4">ROI</th>
              <th className="py-3 px-4"></th>
            </tr>
          </thead>
          <tbody>
            {ranking.map((p, i) => {
              const retorno = retornoOf(p);
              const roi = safeDiv(retorno, p.gasto || 1) * 100;
              return (
                <tr key={p.id} className="border-b border-nord-border/50 hover:bg-white/5">
                  <td className="py-2.5 px-4">
                    {i === 0 ? (
                      <span className="flex items-center gap-1 text-amber-400 font-semibold">
                        <Trophy size={13} /> 1º
                      </span>
                    ) : (
                      <span className="text-nord-gray">{i + 1}º</span>
                    )}
                  </td>
                  <td className="py-2.5 px-4 text-white font-medium">{p.nome}</td>
                  <td className="py-2.5 px-4 text-nord-gray">
                    <code className="bg-nord-panel px-1.5 py-0.5 rounded text-xs">{p.cupom}</code>
                  </td>
                  <td className="py-2.5 px-4 text-nord-gray">{formatNumber(p.quantidadeUtilizada)}</td>
                  <td className="py-2.5 px-4 text-white">{formatCurrency(p.vendas)}</td>
                  <td className="py-2.5 px-4 text-nord-gray">{formatCurrency(p.gasto)}</td>
                  <td className={`py-2.5 px-4 font-medium ${retorno >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                    {formatCurrency(retorno)}
                  </td>
                  <td className={`py-2.5 px-4 font-medium ${roi >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                    {formatNumber(roi, 1)}%
                  </td>
                  <td className="py-2.5 px-4">
                    {canCreate && (
                      <div className="flex items-center gap-3 justify-end">
                        <button onClick={() => openEdit(p)} className="text-nord-gray hover:text-white">
                          <Pencil size={14} />
                        </button>
                        <button onClick={() => setConfirmDeleteId(p.id)} className="text-nord-gray hover:text-red-400">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
            {ranking.length === 0 && (
              <tr>
                <td colSpan={9} className="py-8 text-center text-nord-gray text-sm">
                  Nenhum parceiro/influencer cadastrado ainda.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal open={showForm} onClose={() => setShowForm(false)} title={editing ? "Editar parceiro" : "Novo parceiro"} widthClass="max-w-lg">
        <div className="grid grid-cols-2 gap-3">
          <label className="block col-span-2">
            <span className="block text-xs text-nord-gray mb-1">Nome</span>
            <input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} className="input" placeholder="Ex: @influencer" />
          </label>
          <label className="block col-span-2">
            <span className="block text-xs text-nord-gray mb-1">Cupom</span>
            <input value={form.cupom} onChange={(e) => setForm({ ...form, cupom: e.target.value.toUpperCase() })} className="input" placeholder="Ex: NOME10" />
          </label>
          <label className="block">
            <span className="block text-xs text-nord-gray mb-1">Quantidade utilizada</span>
            <input type="number" value={form.quantidadeUtilizada} onChange={(e) => setForm({ ...form, quantidadeUtilizada: e.target.value })} className="input" />
          </label>
          <label className="block">
            <span className="block text-xs text-nord-gray mb-1">Vendas (R$)</span>
            <input type="number" value={form.vendas} onChange={(e) => setForm({ ...form, vendas: e.target.value })} className="input" />
          </label>
          <label className="block col-span-2">
            <span className="block text-xs text-nord-gray mb-1">Gasto (R$)</span>
            <input type="number" value={form.gasto} onChange={(e) => setForm({ ...form, gasto: e.target.value })} className="input" />
          </label>
          <label className="block col-span-2">
            <span className="block text-xs text-nord-gray mb-1">Observações</span>
            <textarea value={form.observacoes} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} className="input min-h-16" />
          </label>
        </div>
        <button
          onClick={submit}
          disabled={!form.nome.trim() || !form.cupom.trim()}
          className="w-full mt-4 bg-nord-blue hover:bg-nord-blue-light disabled:opacity-50 text-white text-sm font-medium rounded-lg py-2.5"
        >
          Salvar
        </button>
      </Modal>

      <ConfirmDialog
        open={!!confirmDeleteId}
        title="Excluir parceiro"
        message="Tem certeza que deseja excluir este parceiro/influencer?"
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
