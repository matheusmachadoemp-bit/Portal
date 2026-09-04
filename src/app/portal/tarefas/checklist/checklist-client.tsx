"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  Pencil,
  Trash2,
  Copy,
  UserCog,
  Camera,
  Clock,
  Search,
  ChevronDown,
  ChevronUp,
  Ban,
  ExternalLink,
  MessageSquareWarning,
} from "lucide-react";
import { Badge, Section } from "@/components/ui/stat-card";
import { SortableStatCards } from "@/components/ui/sortable-stat-cards";
import { Modal, ConfirmDialog } from "@/components/ui/modal";
import { GOAL_CATEGORIES, GOAL_CATEGORY_LABEL, type GoalCategoryKey } from "@/lib/goals";
import { CHECKLIST_STATUS_LABEL, CHECKLIST_STATUS_TONE } from "@/lib/checklist";

type ItemTemplate = {
  id: string;
  title: string;
  orientacao: string | null;
  tipo: string;
  obrigatorio: boolean;
  fotoObrigatoria: boolean;
  ordem: number;
};

type Template = {
  id: string;
  name: string;
  description: string | null;
  setor: string;
  categoria: string | null;
  turno: string | null;
  active: boolean;
  recurrence: string;
  startDate: string;
  endDate: string | null;
  releaseTime: string;
  dueTime: string;
  segunda: boolean;
  terca: boolean;
  quarta: boolean;
  quinta: boolean;
  sexta: boolean;
  sabado: boolean;
  domingo: boolean;
  responsavelId: string | null;
  responsavel: { id: string; name: string } | null;
  substitutoId: string | null;
  substituto: { id: string; name: string } | null;
  substituirAutomaticamente: boolean;
  fotoChecklist: string;
  exigirObservacaoProblema: boolean;
  cobrancaAtiva: boolean;
  avisoAntesMinutos: number;
  avisoAtrasoResponsavelMinutos: number;
  alertaCriticoMinutos: number;
  naoRealizadoMinutos: number;
  empresa: { id: string; name: string };
  itens: ItemTemplate[];
};

type Occurrence = {
  id: string;
  templateId: string;
  date: string;
  releaseAt: string;
  dueAt: string;
  status: string;
  responsavelId: string | null;
  responsavel: { id: string; name: string } | null;
  startedAt: string | null;
  completedAt: string | null;
  justificativa: string | null;
  template: {
    id: string;
    name: string;
    setor: string;
    turno: string | null;
    fotoChecklist: string;
    empresa: { id: string; name: string };
  };
};

const WEEKDAY_FIELDS = [
  { key: "segunda", label: "Segunda" },
  { key: "terca", label: "Terça" },
  { key: "quarta", label: "Quarta" },
  { key: "quinta", label: "Quinta" },
  { key: "sexta", label: "Sexta" },
  { key: "sabado", label: "Sábado" },
  { key: "domingo", label: "Domingo" },
] as const;

const ITEM_TYPE_LABEL: Record<string, string> = {
  CONCLUIDO: "Marcar como concluído",
  TEXTO_CURTO: "Texto curto",
  TEXTO_LONGO: "Texto longo",
  NUMERO: "Número",
  TEMPERATURA: "Temperatura",
  QUANTIDADE: "Quantidade",
  SIM_NAO: "Sim ou não",
  FOTO: "Foto",
};

const RECURRENCE_LABEL: Record<string, string> = {
  UNICA: "Uma única vez",
  DIARIA: "Diária",
  SEMANAL: "Semanal",
  MENSAL: "Mensal",
  PERSONALIZADA: "Personalizada",
};

const FOTO_LABEL: Record<string, string> = {
  SEM_FOTO: "Sem foto",
  OPCIONAL: "Foto opcional",
  OBRIGATORIA: "Foto obrigatória",
};

function todayInputDate() {
  return new Date().toISOString().slice(0, 10);
}

function emptyForm() {
  return {
    name: "",
    description: "",
    setor: GOAL_CATEGORIES[0] as string,
    categoria: "",
    turno: "",
    active: true,
    recurrence: "DIARIA",
    startDate: todayInputDate(),
    endDate: "",
    releaseTime: "08:00",
    dueTime: "18:00",
    segunda: true,
    terca: false,
    quarta: true,
    quinta: true,
    sexta: true,
    sabado: true,
    domingo: true,
    responsavelId: "",
    substitutoId: "",
    substituirAutomaticamente: false,
    fotoChecklist: "SEM_FOTO",
    exigirObservacaoProblema: false,
    cobrancaAtiva: true,
    avisoAntesMinutos: "30",
    avisoAtrasoResponsavelMinutos: "10",
    alertaCriticoMinutos: "30",
    naoRealizadoMinutos: "60",
    itens: [] as { title: string; orientacao: string; tipo: string; obrigatorio: boolean; fotoObrigatoria: boolean }[],
  };
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
}

function minutesDiff(a: Date, b: Date) {
  return Math.round((a.getTime() - b.getTime()) / 60000);
}

export function ChecklistClient({
  initialOccurrences,
  initialTemplates,
  users,
  dateKey,
  canCreate,
}: {
  initialOccurrences: Occurrence[];
  initialTemplates: Template[];
  users: { id: string; name: string }[];
  dateKey: string;
  canCreate: boolean;
}) {
  const router = useRouter();
  const [occurrences, setOccurrences] = useState(initialOccurrences);
  const [templates, setTemplates] = useState(initialTemplates);
  const [selectedDate, setSelectedDate] = useState(dateKey);
  const [loading, setLoading] = useState(false);

  const [search, setSearch] = useState("");
  const [filterSetor, setFilterSetor] = useState("");
  const [filterResponsavel, setFilterResponsavel] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterTurno, setFilterTurno] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Template | null>(null);
  const [form, setForm] = useState(emptyForm());

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [confirmToggleId, setConfirmToggleId] = useState<Template | null>(null);
  const [reassigning, setReassigning] = useState<Occurrence | null>(null);
  const [reassignUserId, setReassignUserId] = useState("");
  const [justifying, setJustifying] = useState<Occurrence | null>(null);
  const [justificativa, setJustificativa] = useState("");

  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetch(`/api/checklist/occurrences?date=${selectedDate}`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        setOccurrences(data.occurrences);
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [selectedDate]);

  async function refreshOccurrences() {
    const res = await fetch(`/api/checklist/occurrences?date=${selectedDate}`);
    const data = await res.json();
    setOccurrences(data.occurrences);
  }

  async function refreshTemplates() {
    const res = await fetch("/api/checklist/templates");
    const data = await res.json();
    setTemplates(data.templates);
  }

  const filtered = useMemo(() => {
    return occurrences.filter((o) => {
      if (search && !o.template.name.toLowerCase().includes(search.toLowerCase())) return false;
      if (filterSetor && o.template.setor !== filterSetor) return false;
      if (filterResponsavel && o.responsavelId !== filterResponsavel) return false;
      if (filterStatus && o.status !== filterStatus) return false;
      if (filterTurno && o.template.turno !== filterTurno) return false;
      return true;
    });
  }, [occurrences, search, filterSetor, filterResponsavel, filterStatus, filterTurno]);

  const agenda = useMemo(() => [...filtered].sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime()), [filtered]);

  const kpis = useMemo(() => {
    const previstos = filtered.length;
    const concluidosNoPrazo = filtered.filter((o) => o.status === "CONCLUIDO_NO_PRAZO").length;
    const emAndamento = filtered.filter((o) => o.status === "EM_ANDAMENTO").length;
    const atrasados = filtered.filter((o) => o.status === "ATRASADO").length;
    const naoRealizados = filtered.filter((o) => o.status === "NAO_REALIZADO").length;
    const conformidade = previstos > 0 ? (concluidosNoPrazo / previstos) * 100 : 0;
    return { previstos, concluidosNoPrazo, emAndamento, atrasados, naoRealizados, conformidade };
  }, [filtered]);

  const turnos = useMemo(() => [...new Set(templates.map((t) => t.turno).filter(Boolean))] as string[], [templates]);

  function openNew() {
    setEditing(null);
    setForm(emptyForm());
    setShowForm(true);
  }

  function openEdit(t: Template) {
    setEditing(t);
    setForm({
      name: t.name,
      description: t.description ?? "",
      setor: t.setor,
      categoria: t.categoria ?? "",
      turno: t.turno ?? "",
      active: t.active,
      recurrence: t.recurrence,
      startDate: t.startDate.slice(0, 10),
      endDate: t.endDate ? t.endDate.slice(0, 10) : "",
      releaseTime: t.releaseTime,
      dueTime: t.dueTime,
      segunda: t.segunda,
      terca: t.terca,
      quarta: t.quarta,
      quinta: t.quinta,
      sexta: t.sexta,
      sabado: t.sabado,
      domingo: t.domingo,
      responsavelId: t.responsavelId ?? "",
      substitutoId: t.substitutoId ?? "",
      substituirAutomaticamente: t.substituirAutomaticamente,
      fotoChecklist: t.fotoChecklist,
      exigirObservacaoProblema: t.exigirObservacaoProblema,
      cobrancaAtiva: t.cobrancaAtiva,
      avisoAntesMinutos: String(t.avisoAntesMinutos),
      avisoAtrasoResponsavelMinutos: String(t.avisoAtrasoResponsavelMinutos),
      alertaCriticoMinutos: String(t.alertaCriticoMinutos),
      naoRealizadoMinutos: String(t.naoRealizadoMinutos),
      itens: t.itens.map((i) => ({
        title: i.title,
        orientacao: i.orientacao ?? "",
        tipo: i.tipo,
        obrigatorio: i.obrigatorio,
        fotoObrigatoria: i.fotoObrigatoria,
      })),
    });
    setShowForm(true);
  }

  function openDuplicate(t: Template) {
    openEdit(t);
    setEditing(null);
    setForm((f) => ({ ...f, name: `${t.name} (cópia)` }));
    setShowForm(true);
  }

  async function submit() {
    if (form.itens.length === 0) {
      alert("Adicione ao menos um item ao checklist.");
      return;
    }
    const payload = {
      ...form,
      startDate: new Date(`${form.startDate}T00:00:00`).toISOString(),
      endDate: form.endDate ? new Date(`${form.endDate}T00:00:00`).toISOString() : null,
    };
    if (editing) {
      await fetch(`/api/checklist/templates/${editing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } else {
      await fetch("/api/checklist/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    }
    setShowForm(false);
    await Promise.all([refreshTemplates(), refreshOccurrences()]);
  }

  async function toggleActive(t: Template) {
    await fetch(`/api/checklist/templates/${t.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: t.name,
        setor: t.setor,
        recurrence: t.recurrence,
        startDate: t.startDate,
        endDate: t.endDate,
        releaseTime: t.releaseTime,
        dueTime: t.dueTime,
        segunda: t.segunda,
        terca: t.terca,
        quarta: t.quarta,
        quinta: t.quinta,
        sexta: t.sexta,
        sabado: t.sabado,
        domingo: t.domingo,
        active: !t.active,
        itens: t.itens,
      }),
    });
    setConfirmToggleId(null);
    await refreshTemplates();
  }

  async function doDelete() {
    if (!confirmDeleteId) return;
    const res = await fetch(`/api/checklist/templates/${confirmDeleteId}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      alert(data?.error || "Não foi possível excluir esse checklist.");
    }
    setConfirmDeleteId(null);
    await Promise.all([refreshTemplates(), refreshOccurrences()]);
  }

  async function submitReassign() {
    if (!reassigning) return;
    await fetch(`/api/checklist/occurrences/${reassigning.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ responsavelId: reassignUserId || null }),
    });
    setReassigning(null);
    await refreshOccurrences();
  }

  async function submitJustify() {
    if (!justifying) return;
    await fetch(`/api/checklist/occurrences/${justifying.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ justificativa, status: "JUSTIFICADO" }),
    });
    setJustifying(null);
    setJustificativa("");
    await refreshOccurrences();
  }

  function addItem() {
    setForm((f) => ({
      ...f,
      itens: [...f.itens, { title: "", orientacao: "", tipo: "CONCLUIDO", obrigatorio: true, fotoObrigatoria: false }],
    }));
  }
  function updateItem(idx: number, patch: Partial<(typeof form.itens)[number]>) {
    setForm((f) => ({ ...f, itens: f.itens.map((it, i) => (i === idx ? { ...it, ...patch } : it)) }));
  }
  function removeItem(idx: number) {
    setForm((f) => ({ ...f, itens: f.itens.filter((_, i) => i !== idx) }));
  }
  function duplicateItem(idx: number) {
    setForm((f) => {
      const copy = { ...f.itens[idx] };
      const next = [...f.itens];
      next.splice(idx + 1, 0, copy);
      return { ...f, itens: next };
    });
  }
  function moveItem(idx: number, dir: -1 | 1) {
    setForm((f) => {
      const next = [...f.itens];
      const target = idx + dir;
      if (target < 0 || target >= next.length) return f;
      [next[idx], next[target]] = [next[target], next[idx]];
      return { ...f, itens: next };
    });
  }

  return (
    <div className="space-y-6">
      {!canCreate && (
        <p className="text-xs text-amber-400 bg-amber-950/20 border border-amber-900/40 rounded-lg px-3 py-2">
          Você está no modo Grupo Nord (consolidado). Selecione uma loja específica no menu lateral para criar
          ou editar checklists.
        </p>
      )}

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} className="input w-auto" />
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-nord-gray" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar checklist..."
              className="input pl-8 w-48"
            />
          </div>
          <select value={filterSetor} onChange={(e) => setFilterSetor(e.target.value)} className="input w-auto">
            <option value="">Todos os setores</option>
            {GOAL_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {GOAL_CATEGORY_LABEL[c]}
              </option>
            ))}
          </select>
          <select value={filterResponsavel} onChange={(e) => setFilterResponsavel(e.target.value)} className="input w-auto">
            <option value="">Todos os responsáveis</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="input w-auto">
            <option value="">Todos os status</option>
            {Object.entries(CHECKLIST_STATUS_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          {turnos.length > 0 && (
            <select value={filterTurno} onChange={(e) => setFilterTurno(e.target.value)} className="input w-auto">
              <option value="">Todos os turnos</option>
              {turnos.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          )}
          {loading && <span className="text-xs text-nord-gray">Carregando...</span>}
        </div>
        {canCreate && (
          <button
            onClick={openNew}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-nord-blue hover:bg-nord-blue-light text-white font-medium"
          >
            <Plus size={13} /> Novo checklist
          </button>
        )}
      </div>

      <SortableStatCards
        storageKey="checklist-kpi-order"
        className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4"
        cards={[
          { key: "previstos", label: "Previstos hoje", value: String(kpis.previstos), icon: "ListChecks", color: "#1464F4" },
          {
            key: "concluidos",
            label: "Concluídos no prazo",
            value: String(kpis.concluidosNoPrazo),
            icon: "CheckCircle2",
            color: "#22c55e",
          },
          { key: "andamento", label: "Em andamento", value: String(kpis.emAndamento), icon: "Clock", color: "#2952E3" },
          { key: "atrasados", label: "Atrasados", value: String(kpis.atrasados), icon: "AlertTriangle", color: "#f59e0b" },
          { key: "nao-realizados", label: "Não realizados", value: String(kpis.naoRealizados), icon: "XCircle", color: "#ef4444" },
          {
            key: "conformidade",
            label: "Conformidade",
            value: `${kpis.conformidade.toFixed(0)}%`,
            icon: "TrendingUp",
            color: "#f59e0b",
          },
        ]}
      />

      <Section title="Agenda do dia">
        {agenda.length === 0 ? (
          <p className="text-sm text-nord-gray text-center py-8">Nenhum checklist para essa data.</p>
        ) : (
          <div className="space-y-2">
            {agenda.map((o) => {
              const now = new Date();
              const due = new Date(o.dueAt).getTime();
              const remaining = minutesDiff(new Date(o.dueAt), now);
              return (
                <button
                  key={o.id}
                  onClick={() => router.push(`/portal/tarefas/checklist/executar/${o.id}`)}
                  className="w-full flex items-center gap-3 rounded-lg border border-nord-border/60 hover:border-nord-blue-light p-3 text-left transition-colors"
                >
                  <span className="w-14 shrink-0 text-sm font-mono text-white">{formatTime(o.dueAt)}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-white text-sm font-medium truncate">{o.template.name}</p>
                    <p className="text-xs text-nord-gray truncate">
                      {o.template.empresa.name} · {GOAL_CATEGORY_LABEL[o.template.setor as GoalCategoryKey] ?? o.template.setor}
                      {o.responsavel ? ` · ${o.responsavel.name}` : ""}
                    </p>
                  </div>
                  {o.template.fotoChecklist !== "SEM_FOTO" && (
                    <Camera size={14} className={o.template.fotoChecklist === "OBRIGATORIA" ? "text-amber-400" : "text-nord-gray"} />
                  )}
                  <span className="text-xs text-nord-gray w-28 text-right shrink-0 flex items-center justify-end gap-1">
                    <Clock size={12} />
                    {due >= now.getTime() ? `${remaining} min restantes` : `${-remaining} min de atraso`}
                  </span>
                  <Badge tone={CHECKLIST_STATUS_TONE[o.status as keyof typeof CHECKLIST_STATUS_TONE]}>
                    {CHECKLIST_STATUS_LABEL[o.status as keyof typeof CHECKLIST_STATUS_LABEL]}
                  </Badge>
                </button>
              );
            })}
          </div>
        )}
      </Section>

      <Section title="Tabela de checklists">
        <div className="overflow-x-auto nord-scrollbar">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-white border-b border-nord-border">
                <th className="py-2 px-3">Checklist</th>
                <th className="py-2 px-3">Loja</th>
                <th className="py-2 px-3">Setor</th>
                <th className="py-2 px-3">Responsável</th>
                <th className="py-2 px-3">Liberação</th>
                <th className="py-2 px-3">Limite</th>
                <th className="py-2 px-3">Comprovação</th>
                <th className="py-2 px-3">Status</th>
                <th className="py-2 px-3"></th>
              </tr>
            </thead>
            <tbody>
              {agenda.map((o) => {
                const template = templates.find((t) => t.id === o.templateId);
                return (
                  <tr key={o.id} className="border-b border-nord-border/50">
                    <td className="py-2 px-3 text-white">{o.template.name}</td>
                    <td className="py-2 px-3 text-nord-gray">{o.template.empresa.name}</td>
                    <td className="py-2 px-3 text-nord-gray">
                      {GOAL_CATEGORY_LABEL[o.template.setor as GoalCategoryKey] ?? o.template.setor}
                    </td>
                    <td className="py-2 px-3 text-nord-gray">{o.responsavel?.name ?? "-"}</td>
                    <td className="py-2 px-3 text-nord-gray font-mono">{formatTime(o.releaseAt)}</td>
                    <td className="py-2 px-3 text-nord-gray font-mono">{formatTime(o.dueAt)}</td>
                    <td className="py-2 px-3 text-nord-gray">{FOTO_LABEL[o.template.fotoChecklist] ?? o.template.fotoChecklist}</td>
                    <td className="py-2 px-3">
                      <Badge tone={CHECKLIST_STATUS_TONE[o.status as keyof typeof CHECKLIST_STATUS_TONE]}>
                        {CHECKLIST_STATUS_LABEL[o.status as keyof typeof CHECKLIST_STATUS_LABEL]}
                      </Badge>
                    </td>
                    <td className="py-2 px-3">
                      {canCreate && (
                        <div className="flex items-center gap-2 justify-end">
                          <button
                            onClick={() => router.push(`/portal/tarefas/checklist/executar/${o.id}`)}
                            className="text-nord-gray hover:text-white"
                            title="Abrir"
                          >
                            <ExternalLink size={13} />
                          </button>
                          {(o.status === "ATRASADO" || o.status === "NAO_REALIZADO") && (
                            <button
                              onClick={() => {
                                setJustifying(o);
                                setJustificativa(o.justificativa ?? "");
                              }}
                              className="text-nord-gray hover:text-white"
                              title="Justificar"
                            >
                              <MessageSquareWarning size={13} />
                            </button>
                          )}
                          <button
                            onClick={() => {
                              setReassigning(o);
                              setReassignUserId(o.responsavelId ?? "");
                            }}
                            className="text-nord-gray hover:text-white"
                            title="Reatribuir"
                          >
                            <UserCog size={13} />
                          </button>
                          {template && (
                            <>
                              <button onClick={() => openEdit(template)} className="text-nord-gray hover:text-white" title="Editar">
                                <Pencil size={13} />
                              </button>
                              <button
                                onClick={() => openDuplicate(template)}
                                className="text-nord-gray hover:text-white"
                                title="Duplicar"
                              >
                                <Copy size={13} />
                              </button>
                              <button
                                onClick={() => setConfirmToggleId(template)}
                                className="text-nord-gray hover:text-white"
                                title={template.active ? "Desativar" : "Ativar"}
                              >
                                <Ban size={13} />
                              </button>
                              <button
                                onClick={() => setConfirmDeleteId(template.id)}
                                className="text-nord-gray hover:text-red-400"
                                title="Excluir"
                              >
                                <Trash2 size={13} />
                              </button>
                            </>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
              {agenda.length === 0 && (
                <tr>
                  <td colSpan={9} className="text-center text-sm text-nord-gray py-8">
                    Nenhum checklist cadastrado ainda.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Section>

      {/* Modal: Nova/Editar checklist */}
      <Modal
        open={showForm}
        onClose={() => setShowForm(false)}
        title={editing ? "Editar checklist" : "Novo checklist"}
        widthClass="max-w-2xl"
      >
        <div className="space-y-5">
          <div>
            <p className="text-xs text-nord-gray mb-2 font-medium">Informações gerais</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Field label="Nome do checklist">
                  <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="input" />
                </Field>
              </div>
              <div className="col-span-2">
                <Field label="Descrição">
                  <textarea
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    className="input min-h-14"
                  />
                </Field>
              </div>
              <Field label="Setor">
                <select value={form.setor} onChange={(e) => setForm({ ...form, setor: e.target.value })} className="input">
                  {GOAL_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {GOAL_CATEGORY_LABEL[c]}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Turno">
                <input value={form.turno} onChange={(e) => setForm({ ...form, turno: e.target.value })} placeholder="Ex.: Abertura" className="input" />
              </Field>
              <Field label="Categoria">
                <input value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value })} className="input" />
              </Field>
              <label className="flex items-center gap-2 mt-6">
                <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
                <span className="text-sm text-white">Ativo</span>
              </label>
            </div>
          </div>

          <div>
            <p className="text-xs text-nord-gray mb-2 font-medium">Programação</p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Recorrência">
                <select value={form.recurrence} onChange={(e) => setForm({ ...form, recurrence: e.target.value })} className="input">
                  {Object.entries(RECURRENCE_LABEL).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Data inicial">
                <input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} className="input" />
              </Field>
              <Field label="Horário de liberação">
                <input type="time" value={form.releaseTime} onChange={(e) => setForm({ ...form, releaseTime: e.target.value })} className="input" />
              </Field>
              <Field label="Horário limite">
                <input type="time" value={form.dueTime} onChange={(e) => setForm({ ...form, dueTime: e.target.value })} className="input" />
              </Field>
              <div className="col-span-2">
                <Field label="Data final (opcional)">
                  <input type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} className="input" />
                </Field>
              </div>
              <div className="col-span-2">
                <span className="block text-xs text-nord-gray mb-1">Dias da semana</span>
                <div className="flex flex-wrap gap-2">
                  {WEEKDAY_FIELDS.map((d) => (
                    <label
                      key={d.key}
                      className={`px-2.5 py-1.5 rounded-lg text-xs cursor-pointer border ${
                        form[d.key] ? "bg-nord-blue border-nord-blue text-white" : "border-nord-border text-nord-gray"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={form[d.key]}
                        onChange={(e) => setForm({ ...form, [d.key]: e.target.checked })}
                        className="hidden"
                      />
                      {d.label}
                    </label>
                  ))}
                </div>
                <p className="text-[11px] text-nord-gray mt-1">
                  As duas lojas fecham às terças — terça vem desmarcada por padrão, mas pode ser ativada.
                </p>
              </div>
            </div>
          </div>

          <div>
            <p className="text-xs text-nord-gray mb-2 font-medium">Responsável</p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Responsável principal">
                <select value={form.responsavelId} onChange={(e) => setForm({ ...form, responsavelId: e.target.value })} className="input">
                  <option value="">Selecione</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Responsável substituto">
                <select value={form.substitutoId} onChange={(e) => setForm({ ...form, substitutoId: e.target.value })} className="input">
                  <option value="">Nenhum</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
              </Field>
              <div className="col-span-2">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={form.substituirAutomaticamente}
                    onChange={(e) => setForm({ ...form, substituirAutomaticamente: e.target.checked })}
                  />
                  <span className="text-sm text-white">Substituir automaticamente durante folgas</span>
                </label>
              </div>
            </div>
          </div>

          <div>
            <p className="text-xs text-nord-gray mb-2 font-medium">Comprovação</p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Foto do checklist">
                <select value={form.fotoChecklist} onChange={(e) => setForm({ ...form, fotoChecklist: e.target.value })} className="input">
                  {Object.entries(FOTO_LABEL).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </Field>
              <label className="flex items-center gap-2 mt-6">
                <input
                  type="checkbox"
                  checked={form.exigirObservacaoProblema}
                  onChange={(e) => setForm({ ...form, exigirObservacaoProblema: e.target.checked })}
                />
                <span className="text-sm text-white">Exigir observação quando houver problema</span>
              </label>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-nord-gray font-medium">Itens do checklist</p>
              <button onClick={addItem} className="text-xs text-nord-blue-light hover:underline flex items-center gap-1">
                <Plus size={12} /> Adicionar item
              </button>
            </div>
            <div className="space-y-2">
              {form.itens.map((item, idx) => (
                <div key={idx} className="rounded-lg border border-nord-border p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <input
                      value={item.title}
                      onChange={(e) => updateItem(idx, { title: e.target.value })}
                      placeholder="Título do item"
                      className="input flex-1"
                    />
                    <select value={item.tipo} onChange={(e) => updateItem(idx, { tipo: e.target.value })} className="input w-auto">
                      {Object.entries(ITEM_TYPE_LABEL).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v}
                        </option>
                      ))}
                    </select>
                  </div>
                  <input
                    value={item.orientacao}
                    onChange={(e) => updateItem(idx, { orientacao: e.target.value })}
                    placeholder="Orientação (opcional)"
                    className="input"
                  />
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-3">
                      <label className="flex items-center gap-1.5 text-xs text-nord-gray">
                        <input
                          type="checkbox"
                          checked={item.obrigatorio}
                          onChange={(e) => updateItem(idx, { obrigatorio: e.target.checked })}
                        />
                        Obrigatório
                      </label>
                      <label className="flex items-center gap-1.5 text-xs text-nord-gray">
                        <input
                          type="checkbox"
                          checked={item.fotoObrigatoria}
                          onChange={(e) => updateItem(idx, { fotoObrigatoria: e.target.checked })}
                        />
                        Foto obrigatória
                      </label>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button onClick={() => moveItem(idx, -1)} className="text-nord-gray hover:text-white" title="Mover para cima">
                        <ChevronUp size={14} />
                      </button>
                      <button onClick={() => moveItem(idx, 1)} className="text-nord-gray hover:text-white" title="Mover para baixo">
                        <ChevronDown size={14} />
                      </button>
                      <button onClick={() => duplicateItem(idx)} className="text-nord-gray hover:text-white" title="Duplicar">
                        <Copy size={13} />
                      </button>
                      <button onClick={() => removeItem(idx)} className="text-nord-gray hover:text-red-400" title="Excluir">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
              {form.itens.length === 0 && <p className="text-xs text-nord-gray text-center py-3">Nenhum item adicionado ainda.</p>}
            </div>
          </div>

          <button onClick={submit} className="w-full bg-nord-blue hover:bg-nord-blue-light text-white text-sm font-medium rounded-lg py-2.5">
            Salvar checklist
          </button>
        </div>
      </Modal>

      {/* Reatribuir */}
      <Modal open={!!reassigning} onClose={() => setReassigning(null)} title="Reatribuir responsável" widthClass="max-w-sm">
        <div className="space-y-3">
          <Field label="Novo responsável">
            <select value={reassignUserId} onChange={(e) => setReassignUserId(e.target.value)} className="input">
              <option value="">Ninguém</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </Field>
          <button onClick={submitReassign} className="w-full bg-nord-blue hover:bg-nord-blue-light text-white text-sm font-medium rounded-lg py-2.5">
            Salvar
          </button>
        </div>
      </Modal>

      {/* Justificar */}
      <Modal open={!!justifying} onClose={() => setJustifying(null)} title="Justificar atraso" widthClass="max-w-sm">
        <div className="space-y-3">
          <Field label="Justificativa">
            <textarea value={justificativa} onChange={(e) => setJustificativa(e.target.value)} className="input min-h-24" />
          </Field>
          <button onClick={submitJustify} className="w-full bg-nord-blue hover:bg-nord-blue-light text-white text-sm font-medium rounded-lg py-2.5">
            Registrar justificativa
          </button>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!confirmDeleteId}
        title="Excluir checklist"
        message="Tem certeza que deseja excluir esse checklist? Essa ação não pode ser desfeita."
        onConfirm={doDelete}
        onCancel={() => setConfirmDeleteId(null)}
        confirmLabel="Excluir"
        danger
      />

      <ConfirmDialog
        open={!!confirmToggleId}
        title={confirmToggleId?.active ? "Desativar checklist" : "Ativar checklist"}
        message={
          confirmToggleId?.active
            ? "Desativar interrompe a geração de novas execuções deste checklist. O histórico é mantido."
            : "Ativar volta a gerar execuções deste checklist a partir de hoje."
        }
        onConfirm={() => confirmToggleId && toggleActive(confirmToggleId)}
        onCancel={() => setConfirmToggleId(null)}
        confirmLabel={confirmToggleId?.active ? "Desativar" : "Ativar"}
        danger={confirmToggleId?.active}
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
