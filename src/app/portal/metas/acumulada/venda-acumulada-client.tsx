"use client";

import { useMemo, useState } from "react";
import { Plus, Trash2, Trophy, Award } from "lucide-react";
import { Section, ProgressBar, Badge } from "@/components/ui/stat-card";
import { SortableStatCards } from "@/components/ui/sortable-stat-cards";
import { Modal, ConfirmDialog } from "@/components/ui/modal";
import { formatCurrency } from "@/lib/calc";
import { format } from "date-fns";
import { BONUS_TIERS, achievedTiers, nextTier, progressToNextTier, missingForNextTier } from "@/lib/venda-acumulada";

type EntryDTO = {
  id: string;
  employeeId: string;
  employeeName: string;
  employeePhoto: string | null;
  amount: number;
  date: string;
  note: string | null;
};

type EmployeeOption = { id: string; name: string; cargo: string; photoUrl: string | null };

export function VendaAcumuladaClient({
  initialEntries,
  employees,
  canCreate,
}: {
  initialEntries: EntryDTO[];
  employees: EmployeeOption[];
  canCreate: boolean;
}) {
  const [entries, setEntries] = useState(initialEntries);
  const [showForm, setShowForm] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [form, setForm] = useState({
    employeeId: "",
    amount: "",
    date: format(new Date(), "yyyy-MM-dd"),
    note: "",
  });

  const waiters = useMemo(() => {
    const byEmployee = new Map<string, { name: string; photo: string | null; total: number; entries: EntryDTO[] }>();
    for (const e of entries) {
      const cur = byEmployee.get(e.employeeId) ?? { name: e.employeeName, photo: e.employeePhoto, total: 0, entries: [] };
      cur.total += e.amount;
      cur.entries.push(e);
      byEmployee.set(e.employeeId, cur);
    }
    return [...byEmployee.entries()]
      .map(([employeeId, v]) => ({ employeeId, ...v }))
      .sort((a, b) => b.total - a.total);
  }, [entries]);

  const totalGeral = waiters.reduce((sum, w) => sum + w.total, 0);
  const totalConquistas = waiters.reduce((sum, w) => sum + achievedTiers(w.total).length, 0);

  async function refresh() {
    const res = await fetch("/api/venda-acumulada");
    const data = await res.json();
    setEntries(data.entries);
  }

  async function submit() {
    await fetch("/api/venda-acumulada", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setShowForm(false);
    setForm({ employeeId: "", amount: "", date: format(new Date(), "yyyy-MM-dd"), note: "" });
    refresh();
  }

  async function doDelete() {
    if (!confirmDeleteId) return;
    await fetch(`/api/venda-acumulada/${confirmDeleteId}`, { method: "DELETE" });
    setConfirmDeleteId(null);
    refresh();
  }

  return (
    <div className="space-y-6">
      <SortableStatCards
        storageKey="metas-acumulada-kpi-order"
        className="grid grid-cols-2 md:grid-cols-4 gap-4"
        cards={[
          { key: "total-vendido-acumulado", label: "Total vendido acumulado", value: formatCurrency(totalGeral), icon: "Trophy", color: "#f59e0b" },
          { key: "garcons-participantes", label: "Garçons participantes", value: String(waiters.length), icon: "Users" },
          { key: "faixas-conquistadas", label: "Faixas conquistadas", value: String(totalConquistas), icon: "Award", color: "#22c55e" },
          { key: "lider-ranking", label: "Líder do ranking", value: waiters[0]?.name ?? "—", icon: "Crown", color: "#f59e0b" },
        ]}
      />

      {!canCreate && (
        <p className="text-xs text-amber-400 bg-amber-950/20 border border-amber-900/40 rounded-lg px-3 py-2">
          Você está no modo Grupo Nord (consolidado). Selecione uma loja específica no menu lateral para lançar vendas.
        </p>
      )}
      {canCreate && (
        <div className="flex justify-end">
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-nord-blue hover:bg-nord-blue-light text-white font-medium"
          >
            <Plus size={13} /> Lançar venda
          </button>
        </div>
      )}

      <Section title="Faixas de premiação">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {BONUS_TIERS.map((t) => (
            <div key={t.threshold} className="rounded-lg border border-nord-border p-3 text-center">
              <p className="text-white text-sm font-medium">{formatCurrency(t.threshold)}</p>
              <p className="text-[11px] text-nord-gray">vendidos</p>
              <p className="text-emerald-400 text-xs font-medium mt-1">bônus de {formatCurrency(t.bonus)}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Ranking de garçons">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {waiters.map((w, idx) => {
            const tiersAchieved = achievedTiers(w.total);
            const next = nextTier(w.total);
            const progress = progressToNextTier(w.total);
            const missing = missingForNextTier(w.total);
            return (
              <div key={w.employeeId} className="nord-card p-4 flex flex-col gap-3">
                <div className="flex items-center gap-3">
                  {w.photo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={w.photo} alt={w.name} className="w-11 h-11 rounded-full object-cover shrink-0" />
                  ) : (
                    <div className="w-11 h-11 rounded-full bg-nord-panel flex items-center justify-center text-nord-gray text-sm font-medium shrink-0">
                      {w.name.slice(0, 2).toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      {idx === 0 && <Trophy size={14} className="text-amber-400 shrink-0" />}
                      <p className="text-white font-medium text-sm truncate">
                        {idx + 1}º {w.name}
                      </p>
                    </div>
                    <p className="text-xs text-nord-gray">{formatCurrency(w.total)} vendidos</p>
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-xs text-nord-gray mb-1">
                    <span>{next ? `Próxima meta: ${formatCurrency(next.threshold)}` : "Todas as faixas conquistadas"}</span>
                    <span>{progress.toFixed(0)}%</span>
                  </div>
                  <ProgressBar percent={progress} color={next ? "#2952E3" : "#22c55e"} />
                  {next && (
                    <p className="text-[11px] text-nord-gray mt-1">
                      Falta {formatCurrency(missing)} para {w.name.split(" ")[0]} conquistar o bônus de {formatCurrency(next.bonus)}.
                    </p>
                  )}
                </div>

                {tiersAchieved.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {tiersAchieved.map((t) => (
                      <Badge key={t.threshold} tone="success">
                        <Award size={10} className="inline mr-1 -mt-0.5" />
                        {formatCurrency(t.threshold)} conquistada
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          {waiters.length === 0 && (
            <p className="text-sm text-nord-gray col-span-full text-center py-10">
              Nenhuma venda lançada ainda para garçons nesta loja.
            </p>
          )}
        </div>
      </Section>

      {entries.length > 0 && (
        <Section title="Lançamentos recentes">
          <div className="space-y-1.5">
            {entries.slice(0, 20).map((e) => (
              <div key={e.id} className="flex items-center justify-between gap-3 text-xs border-b border-nord-border/60 py-2 last:border-0">
                <span className="text-white flex-1 truncate">{e.employeeName}</span>
                <span className="text-nord-gray">{format(new Date(e.date), "dd/MM/yyyy")}</span>
                <span className="text-emerald-400 font-medium w-28 text-right">{formatCurrency(e.amount)}</span>
                {canCreate && (
                  <button onClick={() => setConfirmDeleteId(e.id)} className="text-nord-gray hover:text-red-400">
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
            ))}
          </div>
        </Section>
      )}

      <Modal open={showForm} onClose={() => setShowForm(false)} title="Lançar venda" widthClass="max-w-sm">
        <div className="space-y-3">
          <label className="block">
            <span className="block text-xs text-nord-gray mb-1">Garçom</span>
            <select value={form.employeeId} onChange={(e) => setForm({ ...form, employeeId: e.target.value })} className="input">
              <option value="">Selecione...</option>
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.name} — {emp.cargo}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="block text-xs text-nord-gray mb-1">Valor vendido (R$)</span>
            <input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} className="input" />
          </label>
          <label className="block">
            <span className="block text-xs text-nord-gray mb-1">Data</span>
            <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className="input" />
          </label>
          <label className="block">
            <span className="block text-xs text-nord-gray mb-1">Observação (opcional)</span>
            <input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} className="input" />
          </label>
          <button
            onClick={submit}
            disabled={!form.employeeId || !form.amount}
            className="w-full bg-nord-blue hover:bg-nord-blue-light disabled:opacity-50 text-white text-sm font-medium rounded-lg py-2.5"
          >
            Salvar
          </button>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!confirmDeleteId}
        title="Excluir lançamento"
        message="Tem certeza que deseja excluir este lançamento de venda?"
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
