"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Plus, Pencil, Trash2, Paperclip, AlertTriangle, AlertCircle } from "lucide-react";
import { Badge, Section } from "@/components/ui/stat-card";
import { SortableStatCards } from "@/components/ui/sortable-stat-cards";
import { RadialProgress } from "@/components/ui/radial-progress";
import { Modal, ConfirmDialog } from "@/components/ui/modal";
import { formatNumber, growth, pct } from "@/lib/calc";
import {
  currentMonth,
  dateToMonth,
  GOAL_CATEGORIES,
  GOAL_CATEGORY_LABEL,
  GOAL_CATEGORY_ROUTE,
  GOAL_STATUS_LABEL,
  GOAL_STATUS_TONE,
  monthToDateRange,
  type GoalCategoryKey,
} from "@/lib/goals";
import { previousPeriodo } from "@/lib/reuniao";

type GoalDTO = {
  id: string;
  name: string;
  category: string;
  responsavel: string;
  description: string | null;
  indicador: string | null;
  valorMeta: number;
  valorRealizado: number;
  unidade: string;
  startDate: string;
  endDate: string;
  bonificacao: string | null;
  status: string;
  observacoes: string | null;
  planoDeAcao: string | null;
  attachments: { id: string; fileName: string; fileUrl: string }[];
};

const emptyForm = {
  name: "",
  responsavel: "",
  description: "",
  indicador: "",
  valorMeta: "",
  valorRealizado: "",
  unidade: "R$",
  mes: currentMonth(),
  bonificacao: "",
  observacoes: "",
  planoDeAcao: "",
};

function goalsOfMonth(goals: GoalDTO[], month: string) {
  return goals.filter((g) => dateToMonth(g.startDate) === month);
}

function kpisOf(list: GoalDTO[]) {
  const total = list.length;
  const concluidas = list.filter((g) => g.status === "CONCLUIDA").length;
  const emAndamento = list.filter((g) => g.status === "EM_ANDAMENTO" || g.status === "EM_RISCO").length;
  const atrasadas = list.filter((g) => g.status === "NAO_ATINGIDA").length;
  const mediaConclusao = total ? list.reduce((s, g) => s + Math.min(pct(g.valorRealizado, g.valorMeta), 100), 0) / total : 0;
  return { total, concluidas, emAndamento, atrasadas, mediaConclusao };
}

export function MetasClient({
  initialGoals,
  category,
  canCreate = true,
}: {
  initialGoals: GoalDTO[];
  category: string;
  canCreate?: boolean;
}) {
  const [goals, setGoals] = useState(initialGoals);
  const [mesFiltro, setMesFiltro] = useState(currentMonth());
  const [filterResponsavel, setFilterResponsavel] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<GoalDTO | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [attachGoal, setAttachGoal] = useState<GoalDTO | null>(null);
  const [attachName, setAttachName] = useState("");
  const [attachUrl, setAttachUrl] = useState("");

  const responsaveis = useMemo(() => [...new Set(goals.map((g) => g.responsavel))].filter(Boolean).sort(), [goals]);

  const withRefinements = useMemo(
    () =>
      (list: GoalDTO[]) =>
        list.filter((g) => {
          if (filterResponsavel && g.responsavel !== filterResponsavel) return false;
          if (filterStatus && g.status !== filterStatus) return false;
          return true;
        }),
    [filterResponsavel, filterStatus]
  );

  const filtered = useMemo(
    () => withRefinements(mesFiltro ? goalsOfMonth(goals, mesFiltro) : goals),
    [goals, mesFiltro, withRefinements]
  );

  const ranked = useMemo(
    () => [...filtered].sort((a, b) => pct(b.valorRealizado, b.valorMeta) - pct(a.valorRealizado, a.valorMeta)),
    [filtered]
  );

  const baseMonth = mesFiltro || currentMonth();
  const prevMonth = previousPeriodo(baseMonth);
  const curr = kpisOf(withRefinements(goalsOfMonth(goals, baseMonth)));
  const prev = kpisOf(withRefinements(goalsOfMonth(goals, prevMonth)));

  const alertas = filtered.filter((g) => g.status === "EM_RISCO" || g.status === "NAO_ATINGIDA");

  async function refresh() {
    const res = await fetch(`/api/metas?category=${category}`);
    const data = await res.json();
    setGoals(data.goals);
  }

  function openNew() {
    setEditing(null);
    setForm({ ...emptyForm, mes: mesFiltro || currentMonth() });
    setShowForm(true);
  }

  function openEdit(g: GoalDTO) {
    setEditing(g);
    setForm({
      name: g.name,
      responsavel: g.responsavel,
      description: g.description ?? "",
      indicador: g.indicador ?? "",
      valorMeta: String(g.valorMeta),
      valorRealizado: String(g.valorRealizado),
      unidade: g.unidade,
      mes: dateToMonth(g.startDate),
      bonificacao: g.bonificacao ?? "",
      observacoes: g.observacoes ?? "",
      planoDeAcao: g.planoDeAcao ?? "",
    });
    setShowForm(true);
  }

  async function submit() {
    const { mes, ...rest } = form;
    const payload = { ...rest, ...monthToDateRange(mes), category };
    if (editing) {
      await fetch(`/api/metas/${editing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } else {
      await fetch("/api/metas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    }
    setShowForm(false);
    refresh();
  }

  async function doDelete() {
    if (!confirmDeleteId) return;
    await fetch(`/api/metas/${confirmDeleteId}`, { method: "DELETE" });
    setConfirmDeleteId(null);
    refresh();
  }

  async function addAttachment() {
    if (!attachGoal || !attachName || !attachUrl) return;
    await fetch(`/api/metas/${attachGoal.id}/attachments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fileName: attachName, fileUrl: attachUrl }),
    });
    setAttachName("");
    setAttachUrl("");
    setAttachGoal(null);
    refresh();
  }

  return (
    <div className="space-y-6">
      {!canCreate && (
        <p className="text-xs text-amber-400 bg-amber-950/20 border border-amber-900/40 rounded-lg px-3 py-2">
          Você está no modo Grupo Nord (consolidado). Selecione uma loja específica no menu lateral para criar
          ou editar metas.
        </p>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        {GOAL_CATEGORIES.map((c) => (
          <Link
            key={c}
            href={`/portal/metas/${GOAL_CATEGORY_ROUTE[c]}`}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              c === category ? "bg-nord-blue text-white" : "text-nord-gray border border-nord-border hover:text-white hover:border-nord-blue-light"
            }`}
          >
            {GOAL_CATEGORY_LABEL[c]}
          </Link>
        ))}
      </div>

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <input type="month" value={mesFiltro} onChange={(e) => setMesFiltro(e.target.value)} className="input w-auto" />
          {mesFiltro && (
            <button onClick={() => setMesFiltro("")} className="text-xs text-nord-blue-light hover:underline">
              Ver todos os meses
            </button>
          )}
          <select value={filterResponsavel} onChange={(e) => setFilterResponsavel(e.target.value)} className="input w-auto">
            <option value="">Todos os responsáveis</option>
            {responsaveis.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="input w-auto">
            <option value="">Todos os status</option>
            {Object.entries(GOAL_STATUS_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>
        {canCreate && (
          <button
            onClick={openNew}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-nord-blue hover:bg-nord-blue-light text-white font-medium"
          >
            <Plus size={13} /> Nova meta
          </button>
        )}
      </div>

      <SortableStatCards
        storageKey={`metas-${category}-kpi-order`}
        className="grid grid-cols-2 md:grid-cols-4 gap-4"
        cards={[
          {
            key: "concluidas",
            label: "Metas concluídas",
            value: String(curr.concluidas),
            icon: "CheckCircle2",
            color: "#22c55e",
            delta: growth(curr.concluidas, prev.concluidas),
          },
          {
            key: "em-andamento",
            label: "Em andamento",
            value: String(curr.emAndamento),
            icon: "Clock",
            color: "#2952E3",
            delta: growth(curr.emAndamento, prev.emAndamento),
          },
          {
            key: "atrasadas",
            label: "Atrasadas",
            value: String(curr.atrasadas),
            icon: "XCircle",
            color: "#ef4444",
            delta: growth(curr.atrasadas, prev.atrasadas),
            invertDeltaColor: true,
          },
          {
            key: "media-conclusao",
            label: "Média de conclusão",
            value: `${curr.mediaConclusao.toFixed(1)}%`,
            icon: "TrendingUp",
            color: "#f59e0b",
            delta: growth(curr.mediaConclusao, prev.mediaConclusao),
          },
        ]}
      />

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="xl:col-span-2">
          <Section title={`Progresso das metas — ${GOAL_CATEGORY_LABEL[category as GoalCategoryKey] ?? category}`}>
            {ranked.length === 0 ? (
              <p className="text-sm text-nord-gray text-center py-6">
                {mesFiltro ? "Nenhuma meta cadastrada nesse mês." : "Nenhuma meta cadastrada nesta categoria ainda."}
              </p>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
                {ranked.map((g) => (
                  <div key={g.id} className="flex flex-col items-center gap-1">
                    <RadialProgress
                      percent={pct(g.valorRealizado, g.valorMeta)}
                      color={g.status === "CONCLUIDA" ? "#22c55e" : g.status === "NAO_ATINGIDA" ? "#ef4444" : "#1464F4"}
                      label={g.name}
                    />
                    <span className="text-[11px] text-nord-gray text-center">
                      {formatNumber(g.valorRealizado)} / {formatNumber(g.valorMeta)} {g.unidade}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Section>
        </div>

        <Section title="Alertas">
          {alertas.length === 0 ? (
            <p className="text-sm text-nord-gray text-center py-6">Nenhum alerta no momento.</p>
          ) : (
            <div className="space-y-2">
              {alertas.map((g) => {
                const late = g.status === "NAO_ATINGIDA";
                return (
                  <div
                    key={g.id}
                    className={`flex items-start gap-2.5 rounded-lg border p-3 ${
                      late ? "border-red-500/40 bg-red-500/5" : "border-amber-500/40 bg-amber-500/5"
                    }`}
                  >
                    {late ? (
                      <AlertCircle size={16} className="text-red-400 shrink-0 mt-0.5" />
                    ) : (
                      <AlertTriangle size={16} className="text-amber-400 shrink-0 mt-0.5" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-white text-xs font-medium truncate">{g.name}</p>
                      <p className="text-[11px] text-nord-gray">
                        {late ? "Prazo encerrado sem atingir a meta." : "Próxima do prazo, ainda abaixo da meta."}
                      </p>
                      {canCreate && (
                        <button onClick={() => openEdit(g)} className="text-[11px] text-nord-blue-light hover:underline mt-1">
                          Ver meta
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Section>
      </div>

      <Section title="Metas individuais">
        <div className="overflow-x-auto nord-scrollbar">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-white border-b border-nord-border">
                <th className="py-2 px-3">Meta</th>
                <th className="py-2 px-3">Responsável</th>
                <th className="py-2 px-3">Meta / Realizado</th>
                <th className="py-2 px-3">Progresso</th>
                <th className="py-2 px-3">Status</th>
                <th className="py-2 px-3"></th>
              </tr>
            </thead>
            <tbody>
              {ranked.map((g) => {
                const percent = pct(g.valorRealizado, g.valorMeta);
                return (
                  <tr key={g.id} className={`border-b border-nord-border/50 ${g.status === "EM_RISCO" ? "bg-amber-500/5" : ""}`}>
                    <td className="py-2 px-3 text-white">{g.name}</td>
                    <td className="py-2 px-3 text-nord-gray">{g.responsavel}</td>
                    <td className="py-2 px-3 text-nord-gray">
                      {formatNumber(g.valorRealizado)} / {formatNumber(g.valorMeta)} {g.unidade}
                    </td>
                    <td className="py-2 px-3 w-40">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-2 rounded-full bg-nord-border overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{ width: `${Math.min(100, percent)}%`, backgroundColor: percent >= 100 ? "#22c55e" : "#1464F4" }}
                          />
                        </div>
                        <span className="text-xs text-nord-gray shrink-0">{percent.toFixed(0)}%</span>
                      </div>
                    </td>
                    <td className="py-2 px-3">
                      <Badge tone={GOAL_STATUS_TONE[g.status]}>{GOAL_STATUS_LABEL[g.status]}</Badge>
                    </td>
                    <td className="py-2 px-3">
                      {canCreate && (
                        <div className="flex items-center gap-2 justify-end">
                          <button onClick={() => openEdit(g)} className="text-nord-gray hover:text-white" title="Editar">
                            <Pencil size={13} />
                          </button>
                          <button onClick={() => setAttachGoal(g)} className="text-nord-gray hover:text-white" title="Anexar">
                            <Paperclip size={13} />
                          </button>
                          <button onClick={() => setConfirmDeleteId(g.id)} className="text-nord-gray hover:text-red-400" title="Excluir">
                            <Trash2 size={13} />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
              {ranked.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center text-sm text-nord-gray py-8">
                    {mesFiltro ? "Nenhuma meta cadastrada nesse mês." : "Nenhuma meta cadastrada nesta categoria ainda."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Section>

      <Modal open={showForm} onClose={() => setShowForm(false)} title={editing ? "Editar meta" : "Nova meta"} widthClass="max-w-xl">
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <Field label="Nome da meta">
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="input" />
            </Field>
          </div>
          <Field label="Responsável">
            <input value={form.responsavel} onChange={(e) => setForm({ ...form, responsavel: e.target.value })} className="input" />
          </Field>
          <Field label="Indicador relacionado">
            <input value={form.indicador} onChange={(e) => setForm({ ...form, indicador: e.target.value })} className="input" />
          </Field>
          <Field label="Valor da meta">
            <input type="number" value={form.valorMeta} onChange={(e) => setForm({ ...form, valorMeta: e.target.value })} className="input" />
          </Field>
          <Field label="Valor realizado">
            <input type="number" value={form.valorRealizado} onChange={(e) => setForm({ ...form, valorRealizado: e.target.value })} className="input" />
          </Field>
          <Field label="Unidade de medida">
            <input value={form.unidade} onChange={(e) => setForm({ ...form, unidade: e.target.value })} className="input" />
          </Field>
          <div className="col-span-2">
            <Field label="Mês de vigência">
              <input type="month" value={form.mes} onChange={(e) => setForm({ ...form, mes: e.target.value })} className="input" />
            </Field>
          </div>
          <div className="col-span-2">
            <Field label="Bonificação">
              <input value={form.bonificacao} onChange={(e) => setForm({ ...form, bonificacao: e.target.value })} className="input" />
            </Field>
          </div>
          <div className="col-span-2">
            <Field label="Descrição">
              <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="input min-h-14" />
            </Field>
          </div>
          <div className="col-span-2">
            <Field label="Plano de ação">
              <textarea value={form.planoDeAcao} onChange={(e) => setForm({ ...form, planoDeAcao: e.target.value })} className="input min-h-14" />
            </Field>
          </div>
          <div className="col-span-2">
            <Field label="Observações">
              <textarea value={form.observacoes} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} className="input min-h-14" />
            </Field>
          </div>
        </div>
        <button onClick={submit} className="w-full mt-4 bg-nord-blue hover:bg-nord-blue-light text-white text-sm font-medium rounded-lg py-2.5">
          Salvar meta
        </button>
      </Modal>

      <Modal open={!!attachGoal} onClose={() => setAttachGoal(null)} title="Anexar arquivo" widthClass="max-w-sm">
        <div className="space-y-3">
          <Field label="Nome do arquivo">
            <input value={attachName} onChange={(e) => setAttachName(e.target.value)} className="input" placeholder="Comprovante.pdf" />
          </Field>
          <Field label="URL do arquivo">
            <input value={attachUrl} onChange={(e) => setAttachUrl(e.target.value)} className="input" placeholder="https://..." />
          </Field>
          <button onClick={addAttachment} className="w-full bg-nord-blue hover:bg-nord-blue-light text-white text-sm font-medium rounded-lg py-2.5">
            Adicionar anexo
          </button>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!confirmDeleteId}
        title="Excluir meta"
        message="Tem certeza que deseja excluir esta meta?"
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs text-nord-gray mb-1">{label}</span>
      {children}
    </label>
  );
}
