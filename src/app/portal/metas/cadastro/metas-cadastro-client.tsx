"use client";

import { useMemo, useState } from "react";
import { Plus, Pencil, Trash2, Paperclip, Award, Clock, Search } from "lucide-react";
import { Badge, ProgressBar } from "@/components/ui/stat-card";
import { Modal, ConfirmDialog } from "@/components/ui/modal";
import { formatNumber, pct } from "@/lib/calc";
import {
  currentMonth,
  dateToMonth,
  GOAL_CATEGORIES,
  GOAL_CATEGORY_LABEL,
  GOAL_STATUS_LABEL,
  GOAL_STATUS_TONE,
  monthToDateRange,
  type GoalCategoryKey,
} from "@/lib/goals";
import { differenceInCalendarDays } from "date-fns";

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

function emptyForm(category: GoalCategoryKey) {
  return {
    name: "",
    category,
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
}

export function MetasCadastroClient({ initialGoals, canCreate = true }: { initialGoals: GoalDTO[]; canCreate?: boolean }) {
  const [goals, setGoals] = useState(initialGoals);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<GoalDTO | null>(null);
  const [form, setForm] = useState(emptyForm(GOAL_CATEGORIES[0]));
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [attachGoal, setAttachGoal] = useState<GoalDTO | null>(null);
  const [attachName, setAttachName] = useState("");
  const [attachUrl, setAttachUrl] = useState("");

  const [search, setSearch] = useState("");
  const [filterSetor, setFilterSetor] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterResponsavel, setFilterResponsavel] = useState("");
  const [filterMes, setFilterMes] = useState("");

  const responsaveis = useMemo(() => [...new Set(goals.map((g) => g.responsavel))].filter(Boolean).sort(), [goals]);

  const filtered = useMemo(() => {
    return goals.filter((g) => {
      if (search && !g.name.toLowerCase().includes(search.toLowerCase())) return false;
      if (filterSetor && g.category !== filterSetor) return false;
      if (filterStatus && g.status !== filterStatus) return false;
      if (filterResponsavel && g.responsavel !== filterResponsavel) return false;
      if (filterMes && dateToMonth(g.startDate) !== filterMes) return false;
      return true;
    });
  }, [goals, search, filterSetor, filterStatus, filterResponsavel, filterMes]);

  const ranked = useMemo(() => [...filtered].sort((a, b) => pct(b.valorRealizado, b.valorMeta) - pct(a.valorRealizado, a.valorMeta)), [filtered]);

  async function refresh() {
    const res = await fetch("/api/metas");
    const data = await res.json();
    setGoals(data.goals);
  }

  function openNew() {
    setEditing(null);
    setForm(emptyForm((filterSetor as GoalCategoryKey) || GOAL_CATEGORIES[0]));
    setShowForm(true);
  }

  function openEdit(g: GoalDTO) {
    setEditing(g);
    setForm({
      name: g.name,
      category: g.category as GoalCategoryKey,
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
    const payload = { ...rest, ...monthToDateRange(mes) };
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

      <div className="nord-card p-4 space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-nord-gray" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar meta..." className="input pl-8" />
          </div>
          {canCreate && (
            <button
              onClick={openNew}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-nord-blue hover:bg-nord-blue-light text-white font-medium shrink-0"
            >
              <Plus size={13} /> Nova meta
            </button>
          )}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <div className="flex items-center gap-1.5">
            <input type="month" value={filterMes} onChange={(e) => setFilterMes(e.target.value)} className="input" />
            {filterMes && (
              <button onClick={() => setFilterMes("")} className="text-xs text-nord-blue-light hover:underline shrink-0" title="Ver todos os meses">
                Todos
              </button>
            )}
          </div>
          <select value={filterSetor} onChange={(e) => setFilterSetor(e.target.value)} className="input">
            <option value="">Todos os setores</option>
            {GOAL_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {GOAL_CATEGORY_LABEL[c]}
              </option>
            ))}
          </select>
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="input">
            <option value="">Todos os status</option>
            {Object.entries(GOAL_STATUS_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          <select value={filterResponsavel} onChange={(e) => setFilterResponsavel(e.target.value)} className="input">
            <option value="">Todos os responsáveis</option>
            {responsaveis.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {ranked.map((g, idx) => {
          const percent = pct(g.valorRealizado, g.valorMeta);
          const daysLeft = differenceInCalendarDays(new Date(g.endDate), new Date());
          return (
            <div
              key={g.id}
              className={`nord-card p-4 flex flex-col gap-3 ${
                g.status === "EM_RISCO" ? "border-amber-500/50 ring-1 ring-amber-500/20" : ""
              }`}
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-1.5">
                    {idx === 0 && <Award size={14} className="text-amber-400" />}
                    <p className="text-white font-medium text-sm">{g.name}</p>
                  </div>
                  <p className="text-xs text-nord-gray">{g.responsavel}</p>
                </div>
                <div className="flex flex-col items-end gap-1.5">
                  <Badge tone="info">{GOAL_CATEGORY_LABEL[g.category as GoalCategoryKey] ?? g.category}</Badge>
                  <Badge tone={GOAL_STATUS_TONE[g.status]}>{GOAL_STATUS_LABEL[g.status]}</Badge>
                </div>
              </div>

              <div>
                <div className="flex justify-between text-xs text-nord-gray mb-1">
                  <span>
                    {formatNumber(g.valorRealizado)} / {formatNumber(g.valorMeta)} {g.unidade}
                  </span>
                  <span>{percent.toFixed(0)}%</span>
                </div>
                <ProgressBar percent={percent} color={percent >= 100 ? "#22c55e" : "#2952E3"} />
              </div>

              <div className="flex items-center justify-between text-xs text-nord-gray">
                <span className="flex items-center gap-1">
                  <Clock size={12} />
                  {daysLeft >= 0 ? `${daysLeft} dias restantes` : "Prazo encerrado"}
                </span>
                {g.bonificacao && <span className="text-emerald-400">{g.bonificacao}</span>}
              </div>

              {g.description && <p className="text-xs text-nord-gray">{g.description}</p>}

              {g.attachments.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {g.attachments.map((a) => (
                    <a
                      key={a.id}
                      href={a.fileUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[11px] flex items-center gap-1 text-nord-blue-light hover:underline"
                    >
                      <Paperclip size={10} /> {a.fileName}
                    </a>
                  ))}
                </div>
              )}

              <div className={`flex items-center gap-2 pt-1 border-t border-nord-border/60 mt-1 ${!canCreate ? "hidden" : ""}`}>
                <button
                  onClick={() => openEdit(g)}
                  className="flex-1 flex items-center justify-center gap-1 text-xs text-nord-gray hover:text-white py-1.5"
                >
                  <Pencil size={12} /> Editar
                </button>
                <button
                  onClick={() => setAttachGoal(g)}
                  className="flex-1 flex items-center justify-center gap-1 text-xs text-nord-gray hover:text-white py-1.5"
                >
                  <Paperclip size={12} /> Anexar
                </button>
                <button
                  onClick={() => setConfirmDeleteId(g.id)}
                  className="flex-1 flex items-center justify-center gap-1 text-xs text-nord-gray hover:text-red-400 py-1.5"
                >
                  <Trash2 size={12} /> Excluir
                </button>
              </div>
            </div>
          );
        })}
        {ranked.length === 0 && (
          <p className="text-sm text-nord-gray col-span-full text-center py-10">
            Nenhuma meta encontrada com os filtros selecionados.
          </p>
        )}
      </div>

      <Modal open={showForm} onClose={() => setShowForm(false)} title={editing ? "Editar meta" : "Nova meta"} widthClass="max-w-xl">
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <Field label="Nome da meta">
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="input" />
            </Field>
          </div>
          <Field label="Setor">
            <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as GoalCategoryKey })} className="input">
              {GOAL_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {GOAL_CATEGORY_LABEL[c]}
                </option>
              ))}
            </select>
          </Field>
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
