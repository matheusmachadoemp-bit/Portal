"use client";

import { useMemo, useState } from "react";
import { Plus, Pencil, Trash2, Paperclip, AlertTriangle, AlertCircle, Award, CalendarCheck2, MessageCircle } from "lucide-react";
import { Badge, Section } from "@/components/ui/stat-card";
import { SortableStatCards } from "@/components/ui/sortable-stat-cards";
import { RadialProgress } from "@/components/ui/radial-progress";
import { Modal, ConfirmDialog } from "@/components/ui/modal";
import { formatNumber, growth, pct } from "@/lib/calc";
import {
  currentMonth,
  dateToMonth,
  GERENCIA_INDICADORES,
  GERENCIA_RESPONSAVEL,
  GOAL_CATEGORY_LABEL,
  GOAL_STATUS_LABEL,
  GOAL_STATUS_TONE,
  monthToDateRange,
  weekDayRange,
  weeksInGoalPeriod,
  type GoalCategoryKey,
} from "@/lib/goals";
import { periodoLabel, previousPeriodo } from "@/lib/reuniao";
import { differenceInCalendarDays } from "date-fns";

type WeeklyUpdateDTO = {
  id: string;
  weekNumber: number;
  valor: number;
  observacao: string | null;
};

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
  weeklyUpdates: WeeklyUpdateDTO[];
};

const emptyForm = {
  name: "",
  responsavel: "",
  description: "",
  indicador: "",
  valorMeta: "",
  unidade: "R$",
  mes: currentMonth(),
  bonificacao: "",
  observacoes: "",
  planoDeAcao: "",
};

function goalsOfMonth(goals: GoalDTO[], month: string) {
  return goals.filter((g) => dateToMonth(g.startDate) === month);
}

/** Indicador de Gerência é um dos 3 fixos (CMV/Checklist/Faturamento) ou "Outro" (texto livre). */
function isGerenciaIndicadorFixo(value: string): boolean {
  return (GERENCIA_INDICADORES as readonly string[]).includes(value);
}

function kpisOf(list: GoalDTO[]) {
  const total = list.length;
  const concluidas = list.filter((g) => g.status === "CONCLUIDA").length;
  const emAndamento = list.filter((g) => g.status === "EM_ANDAMENTO" || g.status === "EM_RISCO").length;
  const atrasadas = list.filter((g) => g.status === "NAO_ATINGIDA").length;
  const mediaConclusao = total ? list.reduce((s, g) => s + Math.min(pct(g.valorRealizado, g.valorMeta), 100), 0) / total : 0;
  return { total, concluidas, emAndamento, atrasadas, mediaConclusao };
}

/**
 * Semana "da vez" dentro do mês de referência (baseMonth) — usada só para o
 * botão de relatório do WhatsApp saber que trecho do mês reportar. Reaproveita
 * `weekDayRange`/`weeksInGoalPeriod` (os mesmos usados no modal "Atualizar
 * semana"), então o relatório fala a mesma linguagem de "dias X–Y" que a tela
 * já mostra. Se o mês em exibição não for o mês corrente (usuário filtrou um
 * mês passado/futuro), cai no início ou no fim do período em vez de usar o
 * dia de hoje (que não existe nesse mês).
 */
function currentWeekInfo(baseMonth: string) {
  const { startDate, endDate } = monthToDateRange(baseMonth);
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  const totalDays = differenceInCalendarDays(end, start) + 1;
  const todayOffset = differenceInCalendarDays(new Date(), start) + 1;
  const day = Math.min(Math.max(todayOffset, 1), totalDays);
  const weekNumber = Math.ceil(day / 7);
  const totalSemanas = weeksInGoalPeriod(start, end);
  const { startDay, endDay } = weekDayRange(weekNumber, totalDays);
  return { weekNumber, totalSemanas, startDay, endDay };
}

/**
 * Texto do relatório semanal enviado pelo botão "Enviar por WhatsApp" de cada
 * subcategoria de Metas — monta um resumo só com o que a tela já tem
 * carregado (nenhuma chamada nova à API). Formatação com `*negrito*`/
 * `_itálico_` porque o WhatsApp renderiza essa marcação no texto recebido.
 */
function buildWeeklyReportText(
  categoryLabel: string,
  baseMonth: string,
  metas: GoalDTO[],
  kpis: ReturnType<typeof kpisOf>,
  semana: ReturnType<typeof currentWeekInfo>
) {
  const linhas = [
    `*Relatório semanal de metas — ${categoryLabel}*`,
    `_Semana ${semana.weekNumber} de ${semana.totalSemanas} (dias ${semana.startDay}–${semana.endDay}) — ${periodoLabel(baseMonth)}_`,
    "",
    `Concluídas: ${kpis.concluidas}`,
    `Em andamento: ${kpis.emAndamento}`,
  ];

  if (metas.length > 0) {
    linhas.push("", "Metas do período:");
    metas.forEach((g) => {
      const percent = pct(g.valorRealizado, g.valorMeta);
      const semanaUpdate = g.weeklyUpdates.find((w) => w.weekNumber === semana.weekNumber);
      linhas.push(
        `• ${g.name}: ${formatNumber(g.valorRealizado)}/${formatNumber(g.valorMeta)} ${g.unidade} (${percent.toFixed(0)}%) — ${GOAL_STATUS_LABEL[g.status]}`
      );
      if (semanaUpdate) {
        linhas.push(
          `   Nesta semana: ${formatNumber(semanaUpdate.valor)} ${g.unidade}${semanaUpdate.observacao ? ` — ${semanaUpdate.observacao}` : ""}`
        );
      }
    });
  } else {
    linhas.push("", `Nenhuma meta cadastrada em ${periodoLabel(baseMonth)} ainda.`);
  }

  linhas.push("", "Enviado pelo Portal Nord.");
  return linhas.join("\n");
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
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<GoalDTO | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [attachGoal, setAttachGoal] = useState<GoalDTO | null>(null);
  const [attachName, setAttachName] = useState("");
  const [attachUrl, setAttachUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [weeklyGoal, setWeeklyGoal] = useState<GoalDTO | null>(null);
  const [weekValues, setWeekValues] = useState<Record<number, string>>({});
  const [weekObs, setWeekObs] = useState<Record<number, string>>({});
  const [savingWeek, setSavingWeek] = useState<number | null>(null);

  // Metas > Gerência tem um formulário simplificado (ver PR): sem
  // descrição/plano de ação/observações, responsável fixo (não digitado) e
  // indicador restrito a 3 opções + "Outro". As outras 5 categorias
  // continuam exatamente como eram.
  const isGerencia = category === "GERENCIA";
  const [indicadorManualEntry, setIndicadorManualEntry] = useState(false);
  const showIndicadorInput = isGerencia && (indicadorManualEntry || (!!form.indicador && !isGerenciaIndicadorFixo(form.indicador)));

  const filtered = useMemo(() => (mesFiltro ? goalsOfMonth(goals, mesFiltro) : goals), [goals, mesFiltro]);

  const ranked = useMemo(
    () => [...filtered].sort((a, b) => pct(b.valorRealizado, b.valorMeta) - pct(a.valorRealizado, a.valorMeta)),
    [filtered]
  );

  const baseMonth = mesFiltro || currentMonth();
  const prevMonth = previousPeriodo(baseMonth);
  const metasDoMes = goalsOfMonth(goals, baseMonth);
  const curr = kpisOf(metasDoMes);
  const prev = kpisOf(goalsOfMonth(goals, prevMonth));

  const alertas = filtered.filter((g) => g.status === "EM_RISCO" || g.status === "NAO_ATINGIDA");

  const semanaAtual = currentWeekInfo(baseMonth);
  const relatorioSemanalTexto = buildWeeklyReportText(
    GOAL_CATEGORY_LABEL[category as GoalCategoryKey] ?? category,
    baseMonth,
    metasDoMes,
    curr,
    semanaAtual
  );

  async function refresh() {
    const res = await fetch(`/api/metas?category=${category}`);
    const data = await res.json();
    // Se a sessão expirar ou a API recusar o pedido, `data.goals` não vem —
    // não sobrescreve a lista já carregada com `undefined` (quebraria os
    // filtros/cards na hora), só devolve a lista anterior.
    if (!Array.isArray(data.goals)) return goals;
    setGoals(data.goals);
    return data.goals as GoalDTO[];
  }

  function openNew() {
    setEditing(null);
    setIndicadorManualEntry(false);
    setForm({ ...emptyForm, mes: mesFiltro || currentMonth(), responsavel: isGerencia ? GERENCIA_RESPONSAVEL : "" });
    setShowForm(true);
  }

  function openEdit(g: GoalDTO) {
    setEditing(g);
    setIndicadorManualEntry(false);
    setForm({
      name: g.name,
      responsavel: isGerencia ? GERENCIA_RESPONSAVEL : g.responsavel,
      description: g.description ?? "",
      indicador: g.indicador ?? "",
      valorMeta: String(g.valorMeta),
      unidade: g.unidade,
      mes: dateToMonth(g.startDate),
      bonificacao: g.bonificacao ?? "",
      observacoes: g.observacoes ?? "",
      planoDeAcao: g.planoDeAcao ?? "",
    });
    setShowForm(true);
  }

  async function submit() {
    if (submitting) return;
    setSubmitting(true);
    try {
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
    } finally {
      setSubmitting(false);
    }
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

  function openWeekly(g: GoalDTO) {
    const values: Record<number, string> = {};
    const obs: Record<number, string> = {};
    g.weeklyUpdates.forEach((w) => {
      values[w.weekNumber] = String(w.valor);
      obs[w.weekNumber] = w.observacao ?? "";
    });
    setWeekValues(values);
    setWeekObs(obs);
    setWeeklyGoal(g);
  }

  async function saveWeek(weekNumber: number) {
    if (!weeklyGoal) return;
    const valor = Number(weekValues[weekNumber]);
    if (Number.isNaN(valor)) return;
    setSavingWeek(weekNumber);
    try {
      await fetch(`/api/metas/${weeklyGoal.id}/semanas`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weekNumber, valor, observacao: weekObs[weekNumber]?.trim() || undefined }),
      });
      const refreshed = await refresh();
      const updated = refreshed.find((g) => g.id === weeklyGoal.id);
      if (updated) setWeeklyGoal(updated);
    } finally {
      setSavingWeek(null);
    }
  }

  async function deleteWeek(weekId: string, weekNumber: number) {
    if (!weeklyGoal) return;
    setSavingWeek(weekNumber);
    try {
      await fetch(`/api/metas/${weeklyGoal.id}/semanas/${weekId}`, { method: "DELETE" });
      const refreshed = await refresh();
      const updated = refreshed.find((g) => g.id === weeklyGoal.id);
      if (updated) setWeeklyGoal(updated);
      setWeekValues((prev) => ({ ...prev, [weekNumber]: "" }));
      setWeekObs((prev) => ({ ...prev, [weekNumber]: "" }));
    } finally {
      setSavingWeek(null);
    }
  }

  const weeklyTotalDays = weeklyGoal ? differenceInCalendarDays(new Date(weeklyGoal.endDate), new Date(weeklyGoal.startDate)) + 1 : 0;
  const weeklyTotalSemanas = weeklyGoal ? weeksInGoalPeriod(new Date(weeklyGoal.startDate), new Date(weeklyGoal.endDate)) : 0;

  return (
    <div className="space-y-6">
      {!canCreate && (
        <p className="text-xs text-nord-warning bg-nord-warning/10 border border-nord-warning/30 rounded-lg px-3 py-2">
          Você está no modo Grupo Nord (consolidado). Selecione uma loja específica no menu lateral para criar
          ou editar metas.
        </p>
      )}

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <input type="month" value={mesFiltro} onChange={(e) => setMesFiltro(e.target.value)} className="input w-auto" />
          {mesFiltro && (
            <button onClick={() => setMesFiltro("")} className="text-xs text-nord-blue-light hover:underline">
              Ver todos os meses
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <a
            href={`https://wa.me/?text=${encodeURIComponent(relatorioSemanalTexto)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-outline"
            title="Enviar o desempenho semanal deste setor pelo WhatsApp"
          >
            <MessageCircle size={13} /> Enviar por WhatsApp
          </a>
          {canCreate && (
            <button
              onClick={openNew}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-nord-blue hover:bg-nord-blue-light text-white font-medium"
            >
              <Plus size={13} /> Nova meta
            </button>
          )}
        </div>
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
                      late ? "border-nord-danger/40 bg-nord-danger/5" : "border-nord-warning/40 bg-nord-warning/5"
                    }`}
                  >
                    {late ? (
                      <AlertCircle size={16} className="text-nord-danger shrink-0 mt-0.5" />
                    ) : (
                      <AlertTriangle size={16} className="text-nord-warning shrink-0 mt-0.5" />
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

      <Section title={`Metas — ${GOAL_CATEGORY_LABEL[category as GoalCategoryKey] ?? category}`}>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {ranked.map((g) => {
            const percent = pct(g.valorRealizado, g.valorMeta);
            return (
              <div
                key={g.id}
                className={`nord-card p-4 flex flex-col gap-3 ${
                  g.status === "EM_RISCO" ? "border-nord-warning/50 ring-1 ring-nord-warning/20" : ""
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-white font-medium text-sm min-w-0 truncate">{g.name}</p>
                  <Badge tone={GOAL_STATUS_TONE[g.status]}>{GOAL_STATUS_LABEL[g.status]}</Badge>
                </div>
                <p className="text-xs text-nord-gray truncate">{g.responsavel}</p>

                <p className="text-xs text-white">
                  Realizado: <span className="font-medium">{formatNumber(g.valorRealizado)} {g.unidade}</span>
                  <span className="text-nord-gray"> — Meta: </span>
                  <span className="font-medium">{formatNumber(g.valorMeta)} {g.unidade}</span>
                </p>

                <div>
                  <div className="h-2 rounded-full bg-nord-border overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${Math.min(100, percent)}%`, backgroundColor: percent >= 100 ? "#22c55e" : "#1464F4" }}
                    />
                  </div>
                  <p className="text-[11px] text-nord-gray mt-1">{percent.toFixed(0)}% concluído</p>
                </div>

                {g.bonificacao && (
                  <p className="flex items-center gap-1.5 text-xs text-nord-success">
                    <Award size={13} className="shrink-0" /> Prêmio: {g.bonificacao}
                  </p>
                )}

                {canCreate && (
                  <div className="flex items-center gap-1.5 pt-2 border-t border-nord-border/60 mt-1">
                    <button
                      onClick={() => openWeekly(g)}
                      className="flex-1 flex items-center justify-center gap-1.5 text-xs bg-nord-blue/15 text-nord-blue-light hover:bg-nord-blue/25 rounded-lg py-1.5 font-medium"
                    >
                      <CalendarCheck2 size={13} /> Atualizar semana
                    </button>
                    <button onClick={() => openEdit(g)} className="text-nord-gray hover:text-white p-1.5" title="Editar meta">
                      <Pencil size={13} />
                    </button>
                    <button onClick={() => setAttachGoal(g)} className="text-nord-gray hover:text-white p-1.5" title="Anexar">
                      <Paperclip size={13} />
                    </button>
                    <button onClick={() => setConfirmDeleteId(g.id)} className="text-nord-gray hover:text-nord-danger p-1.5" title="Excluir">
                      <Trash2 size={13} />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
          {ranked.length === 0 && (
            <p className="text-sm text-nord-gray col-span-full text-center py-8">
              {mesFiltro ? "Nenhuma meta cadastrada nesse mês." : "Nenhuma meta cadastrada nesta categoria ainda."}
            </p>
          )}
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
            {isGerencia ? (
              <>
                <div className="input flex items-center text-nord-gray cursor-not-allowed select-none">{GERENCIA_RESPONSAVEL}</div>
                <p className="text-[11px] text-nord-gray mt-1">Meta de Gerência: responsável é sempre o gerente da loja.</p>
              </>
            ) : (
              <input value={form.responsavel} onChange={(e) => setForm({ ...form, responsavel: e.target.value })} className="input" />
            )}
          </Field>
          <Field label="Indicador relacionado">
            {isGerencia ? (
              showIndicadorInput ? (
                <>
                  <input
                    value={form.indicador}
                    onChange={(e) => setForm({ ...form, indicador: e.target.value })}
                    className="input"
                    placeholder="Digite o indicador"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setIndicadorManualEntry(false);
                      setForm({ ...form, indicador: "" });
                    }}
                    className="text-[11px] text-nord-blue-light hover:underline mt-1"
                  >
                    Usar indicador da lista
                  </button>
                </>
              ) : (
                <select
                  value={form.indicador}
                  onChange={(e) => {
                    if (e.target.value === "__outro__") {
                      setIndicadorManualEntry(true);
                      setForm({ ...form, indicador: "" });
                    } else {
                      setForm({ ...form, indicador: e.target.value });
                    }
                  }}
                  className="input"
                >
                  <option value="" disabled>
                    Selecione o indicador
                  </option>
                  {GERENCIA_INDICADORES.map((i) => (
                    <option key={i} value={i}>
                      {i}
                    </option>
                  ))}
                  <option value="__outro__">Outro (digitar)</option>
                </select>
              )
            ) : (
              <input value={form.indicador} onChange={(e) => setForm({ ...form, indicador: e.target.value })} className="input" />
            )}
          </Field>
          <Field label="Valor da meta">
            <input type="number" value={form.valorMeta} onChange={(e) => setForm({ ...form, valorMeta: e.target.value })} className="input" />
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
          {!isGerencia && (
            <>
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
            </>
          )}
        </div>
        <button
          onClick={submit}
          disabled={submitting}
          className="w-full mt-4 bg-nord-blue hover:bg-nord-blue-light disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg py-2.5"
        >
          {submitting ? "Salvando..." : "Salvar meta"}
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

      <Modal
        open={!!weeklyGoal}
        onClose={() => setWeeklyGoal(null)}
        title={weeklyGoal ? `Atualizações semanais — ${weeklyGoal.name}` : "Atualizações semanais"}
        widthClass="max-w-lg"
      >
        {weeklyGoal && (
          <div className="space-y-3">
            <div className="rounded-lg border border-nord-border bg-nord-panel px-3 py-2.5 flex items-center justify-between">
              <span className="text-xs text-nord-gray">Total somado até agora</span>
              <span className="text-sm text-white font-semibold">
                {formatNumber(weeklyGoal.valorRealizado)} / {formatNumber(weeklyGoal.valorMeta)} {weeklyGoal.unidade}
              </span>
            </div>
            <p className="text-[11px] text-nord-gray">
              Lance o valor de cada semana do mês — o sistema soma tudo automaticamente até o fim do período.
            </p>
            <div className="space-y-2">
              {Array.from({ length: weeklyTotalSemanas }, (_, i) => i + 1).map((weekNumber) => {
                const existing = weeklyGoal.weeklyUpdates.find((w) => w.weekNumber === weekNumber) ?? null;
                const { startDay, endDay } = weekDayRange(weekNumber, weeklyTotalDays);
                const saving = savingWeek === weekNumber;
                return (
                  <div key={weekNumber} className="rounded-lg border border-nord-border p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-white font-medium">
                        Semana {weekNumber} <span className="text-nord-gray font-normal">(dias {startDay}–{endDay})</span>
                      </span>
                      {existing && <span className="text-[10px] text-nord-success">Lançado</span>}
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        value={weekValues[weekNumber] ?? ""}
                        onChange={(e) => setWeekValues({ ...weekValues, [weekNumber]: e.target.value })}
                        placeholder={`Valor da semana (${weeklyGoal.unidade})`}
                        className="input flex-1"
                      />
                      <button
                        onClick={() => saveWeek(weekNumber)}
                        disabled={saving || weekValues[weekNumber] === undefined || weekValues[weekNumber] === ""}
                        className="px-3 py-1.5 rounded-lg text-xs bg-nord-blue hover:bg-nord-blue-light disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium shrink-0"
                      >
                        {saving ? "Salvando..." : existing ? "Corrigir" : "Lançar"}
                      </button>
                      {existing && (
                        <button
                          onClick={() => deleteWeek(existing.id, weekNumber)}
                          disabled={saving}
                          className="text-nord-gray hover:text-nord-danger p-1.5 shrink-0 disabled:opacity-50"
                          title="Remover lançamento"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                    <input
                      value={weekObs[weekNumber] ?? ""}
                      onChange={(e) => setWeekObs({ ...weekObs, [weekNumber]: e.target.value })}
                      placeholder="Observação (opcional)"
                      className="input text-xs"
                    />
                  </div>
                );
              })}
            </div>
          </div>
        )}
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
