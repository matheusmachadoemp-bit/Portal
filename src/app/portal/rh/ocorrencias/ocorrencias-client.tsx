"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { Section, Badge } from "@/components/ui/stat-card";
import { SortableStatCards } from "@/components/ui/sortable-stat-cards";
import { Modal, ConfirmDialog } from "@/components/ui/modal";
import { formatNumber } from "@/lib/calc";
import { format } from "date-fns";
import { RhTabs } from "../rh-tabs";

type OccurrenceDTO = {
  id: string;
  employeeId: string;
  date: string;
  type: string;
  horarioPrevisto: string | null;
  horarioRealizado: string | null;
  minutosAtraso: number;
  justificativa: string | null;
  medidasTomadas: string | null;
  prazo: string | null;
  anexoUrl: string | null;
  observacao: string | null;
  status: string;
  createdAt: string;
  employee: { id: string; name: string; setor: string };
  createdBy: { name: string };
};

const TYPE_LABEL: Record<string, string> = {
  FALTA: "Falta",
  ATRASO: "Atraso",
  ATESTADO: "Atestado",
  ADVERTENCIA: "Advertência",
  SUSPENSAO: "Suspensão",
  ELOGIO: "Elogio",
  ACIDENTE: "Acidente",
  RECLAMACAO: "Reclamação",
  CONFLITO_INTERNO: "Conflito interno",
  FEEDBACK: "Feedback",
};

const STATUS_TONE: Record<string, "default" | "success" | "warning" | "danger"> = {
  PENDENTE: "warning",
  JUSTIFICADA: "success",
  NAO_JUSTIFICADA: "danger",
};

function emptyForm(employeeId: string) {
  return {
    employeeId,
    date: format(new Date(), "yyyy-MM-dd"),
    type: "FALTA",
    horarioPrevisto: "",
    horarioRealizado: "",
    minutosAtraso: "",
    justificativa: "",
    medidasTomadas: "",
    prazo: "",
    anexoUrl: "",
    observacao: "",
    status: "PENDENTE",
  };
}

type OccurrenceCounts = { faltas: number; atrasos: number; advertencias: number; suspensoes: number };
type OccurrenceRanking = { atrasos: [string, number][]; faltas: [string, number][] };

export function OcorrenciasClient({
  initialOccurrences,
  initialCounts,
  initialRanking = { atrasos: [], faltas: [] },
  employees,
  fixedEmployeeId,
  canCreate = true,
  isGrupoNordMode = true,
}: {
  initialOccurrences: OccurrenceDTO[];
  /**
   * Task #309 revisão (Teulis): contagens ("Faltas", "Atrasos" etc.) e ranking SEMPRE calculados
   * no servidor via agregação no banco (ver src/lib/rh-server.ts), nunca contando/agrupando
   * `occurrences`/`visible` aqui no cliente — essa lista tem `take` (teto de segurança contra
   * histórico sem fim), e contar uma lista cortada dá um número errado (silenciosamente menor que
   * o real, podendo até esconder um colaborador inteiro do ranking) assim que o histórico passa do
   * teto. Atualizados a cada `refresh()` (POST/PATCH/DELETE), sempre com uma query própria sem
   * `take`.
   */
  initialCounts: OccurrenceCounts;
  /** Vazio por padrão (só é usado — e só faz sentido — na tela standalone, sem `fixedEmployeeId`). */
  initialRanking?: OccurrenceRanking;
  employees: { id: string; name: string; setor: string }[];
  fixedEmployeeId?: string;
  canCreate?: boolean;
  /** Diferencia por que `canCreate` é falso: modo Grupo Nord (consolidado) ou permissão do perfil numa loja específica. */
  isGrupoNordMode?: boolean;
}) {
  const [occurrences, setOccurrences] = useState(initialOccurrences);
  const [counts, setCounts] = useState(initialCounts);
  const [ranking, setRanking] = useState(initialRanking);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<OccurrenceDTO | null>(null);
  const [form, setForm] = useState(emptyForm(fixedEmployeeId ?? employees[0]?.id ?? ""));
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [detail, setDetail] = useState<OccurrenceDTO | null>(null);
  const [historico, setHistorico] = useState<OccurrenceDTO[]>([]);
  const [submitting, setSubmitting] = useState(false);

  // Só usado pra decidir o que a TABELA mostra (lista de "atividade recente", que já tem `take` —
  // isso é esperado, nunca foi o problema).
  const visible = useMemo(() => {
    return fixedEmployeeId ? occurrences.filter((o) => o.employeeId === fixedEmployeeId) : occurrences;
  }, [occurrences, fixedEmployeeId]);

  // Task #309 revisão (Teulis): "Histórico do colaborador" (dentro do modal de detalhe) filtrava
  // `occurrences` — a mesma lista já cortada pelo `take` da loja inteira — pelo `employeeId` do
  // registro aberto. Um colaborador cujas ocorrências antigas tinham saído do corte mostrava um
  // histórico incompleto (ou vazio) mesmo tendo mais registros de verdade. Agora busca de novo,
  // direto, com `?employeeId=` (mesma rota/teto individual usado pela ficha) toda vez que o modal
  // abre — nunca deriva da lista já cortada.
  useEffect(() => {
    // Não reseta pra `[]` quando o modal fecha (`!detail`): `historico` só é renderizado dentro do
    // bloco `{detail && (...)}` do modal, então o valor da vez anterior fica sem uso até o próximo
    // `detail` ser setado, quando este efeito busca de novo e substitui. Chamar `setHistorico([])`
    // de forma síncrona aqui geraria um cascading render desnecessário (regra
    // react-hooks/set-state-in-effect).
    if (!detail) return;
    let cancelled = false;
    fetch(`/api/rh/occurrences?employeeId=${detail.employeeId}`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        const outras = (data.occurrences as OccurrenceDTO[])
          .filter((o) => o.id !== detail.id)
          .sort((a, b) => (a.date > b.date ? -1 : 1))
          .slice(0, 8);
        setHistorico(outras);
      });
    return () => {
      cancelled = true;
    };
  }, [detail]);

  async function refresh() {
    const url = fixedEmployeeId ? `/api/rh/occurrences?employeeId=${fixedEmployeeId}` : "/api/rh/occurrences";
    const res = await fetch(url);
    const data = await res.json();
    setOccurrences(data.occurrences);
    setCounts(data.counts);
    setRanking(data.ranking);
  }

  function openNew() {
    setEditing(null);
    setForm(emptyForm(fixedEmployeeId ?? employees[0]?.id ?? ""));
    setShowForm(true);
  }

  function openEdit(o: OccurrenceDTO) {
    setEditing(o);
    setForm({
      employeeId: o.employeeId,
      date: format(new Date(o.date), "yyyy-MM-dd"),
      type: o.type,
      horarioPrevisto: o.horarioPrevisto ?? "",
      horarioRealizado: o.horarioRealizado ?? "",
      minutosAtraso: String(o.minutosAtraso),
      justificativa: o.justificativa ?? "",
      medidasTomadas: o.medidasTomadas ?? "",
      prazo: o.prazo ? format(new Date(o.prazo), "yyyy-MM-dd") : "",
      anexoUrl: o.anexoUrl ?? "",
      observacao: o.observacao ?? "",
      status: o.status,
    });
    setShowForm(true);
  }

  async function submit() {
    if (submitting) return;
    setSubmitting(true);
    try {
      if (editing) {
        await fetch(`/api/rh/occurrences/${editing.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        });
      } else {
        await fetch("/api/rh/occurrences", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        });
      }
      setShowForm(false);
      await refresh();
    } finally {
      setSubmitting(false);
    }
  }

  async function doDelete() {
    if (!confirmDeleteId) return;
    await fetch(`/api/rh/occurrences/${confirmDeleteId}`, { method: "DELETE" });
    setConfirmDeleteId(null);
    refresh();
  }

  return (
    <div className="space-y-6">
      <SortableStatCards
        storageKey="rh-ocorrencias-kpi-order"
        className="grid grid-cols-2 md:grid-cols-4 gap-4"
        cards={[
          { key: "faltas", label: "Faltas", value: formatNumber(counts.faltas), icon: "UserX", color: "#ef4444" },
          { key: "atrasos", label: "Atrasos", value: formatNumber(counts.atrasos), icon: "Clock", color: "#eab308" },
          { key: "advertencias", label: "Advertências", value: formatNumber(counts.advertencias), icon: "AlertTriangle", color: "#f97316" },
          { key: "suspensoes", label: "Suspensões", value: formatNumber(counts.suspensoes), icon: "Ban", color: "#ef4444" },
        ]}
      />

      <div className="flex items-center justify-between">
        {!fixedEmployeeId ? <RhTabs /> : <div />}
        {canCreate && (
          <button
            onClick={openNew}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-nord-blue hover:bg-nord-blue-light text-white font-medium"
          >
            <Plus size={13} /> Nova ocorrência
          </button>
        )}
      </div>
      {!canCreate && (
        <p className="text-xs text-nord-warning bg-nord-warning/10 border border-nord-warning/30 rounded-lg px-3 py-2">
          {isGrupoNordMode
            ? "Você está no modo Grupo Nord (consolidado). Selecione uma loja específica no menu lateral para registrar ou editar ocorrências."
            : "Seu perfil de permissão não permite registrar ou editar ocorrências neste módulo."}
        </p>
      )}

      {!fixedEmployeeId && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Section title="Ranking de atrasos">
            <ul className="space-y-2">
              {ranking.atrasos.map(([name, count], i) => (
                <li key={name} className="flex items-center justify-between text-sm">
                  <span className="text-nord-gray">
                    {i + 1}. {name}
                  </span>
                  <Badge tone="warning">{count}x</Badge>
                </li>
              ))}
              {ranking.atrasos.length === 0 && <p className="text-sm text-nord-gray">Sem registros.</p>}
            </ul>
          </Section>
          <Section title="Ranking de faltas">
            <ul className="space-y-2">
              {ranking.faltas.map(([name, count], i) => (
                <li key={name} className="flex items-center justify-between text-sm">
                  <span className="text-nord-gray">
                    {i + 1}. {name}
                  </span>
                  <Badge tone="danger">{count}x</Badge>
                </li>
              ))}
              {ranking.faltas.length === 0 && <p className="text-sm text-nord-gray">Sem registros.</p>}
            </ul>
          </Section>
        </div>
      )}

      <div className="nord-card overflow-x-auto nord-scrollbar">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-nord-gray border-b border-nord-border">
              {!fixedEmployeeId && <th className="py-3 px-4">Colaborador</th>}
              <th className="py-3 px-4">Data</th>
              <th className="py-3 px-4">Tipo</th>
              <th className="py-3 px-4">Responsável</th>
              <th className="py-3 px-4">Status</th>
              <th className="py-3 px-4"></th>
            </tr>
          </thead>
          <tbody>
            {visible.map((o) => (
              <tr key={o.id} className="border-b border-nord-border/50 hover:bg-white/5 cursor-pointer" onClick={() => setDetail(o)}>
                {!fixedEmployeeId && <td className="py-2.5 px-4 text-white">{o.employee.name}</td>}
                <td className="py-2.5 px-4 text-nord-gray">{format(new Date(o.date), "dd/MM/yyyy")}</td>
                <td className="py-2.5 px-4 text-nord-gray">{TYPE_LABEL[o.type] ?? o.type}</td>
                <td className="py-2.5 px-4 text-nord-gray">{o.createdBy?.name ?? "-"}</td>
                <td className="py-2.5 px-4">
                  <Badge tone={STATUS_TONE[o.status]}>{o.status.replaceAll("_", " ")}</Badge>
                </td>
                <td className="py-2.5 px-4">
                  {canCreate && (
                    <div className="flex items-center gap-2 justify-end" onClick={(e) => e.stopPropagation()}>
                      <button onClick={() => openEdit(o)} className="text-nord-gray hover:text-white">
                        <Pencil size={14} />
                      </button>
                      <button onClick={() => setConfirmDeleteId(o.id)} className="text-nord-gray hover:text-nord-danger">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
            {visible.length === 0 && (
              <tr>
                <td colSpan={fixedEmployeeId ? 4 : 5} className="py-8 text-center text-nord-gray text-sm">
                  Nenhuma ocorrência registrada.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal open={showForm} onClose={() => setShowForm(false)} title={editing ? "Editar ocorrência" : "Nova ocorrência"}>
        <div className="grid grid-cols-2 gap-3">
          {!fixedEmployeeId && (
            <div className="col-span-2">
              <Field label="Colaborador">
                <select value={form.employeeId} onChange={(e) => setForm({ ...form, employeeId: e.target.value })} className="input">
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.name} — {emp.setor}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          )}
          <Field label="Data">
            <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className="input" />
          </Field>
          <Field label="Tipo de ocorrência">
            <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className="input">
              {Object.entries(TYPE_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Horário previsto">
            <input value={form.horarioPrevisto} onChange={(e) => setForm({ ...form, horarioPrevisto: e.target.value })} className="input" placeholder="08:00" />
          </Field>
          <Field label="Horário realizado">
            <input value={form.horarioRealizado} onChange={(e) => setForm({ ...form, horarioRealizado: e.target.value })} className="input" placeholder="08:20" />
          </Field>
          <Field label="Minutos de atraso">
            <input type="number" value={form.minutosAtraso} onChange={(e) => setForm({ ...form, minutosAtraso: e.target.value })} className="input" />
          </Field>
          <Field label="Status">
            <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className="input">
              <option value="PENDENTE">Pendente</option>
              <option value="JUSTIFICADA">Justificada</option>
              <option value="NAO_JUSTIFICADA">Não justificada</option>
            </select>
          </Field>
          <Field label="Prazo">
            <input type="date" value={form.prazo} onChange={(e) => setForm({ ...form, prazo: e.target.value })} className="input" />
          </Field>
          <div className="col-span-2">
            <Field label="Descrição / Justificativa">
              <textarea value={form.justificativa} onChange={(e) => setForm({ ...form, justificativa: e.target.value })} className="input min-h-14" />
            </Field>
          </div>
          <div className="col-span-2">
            <Field label="Medidas tomadas">
              <textarea value={form.medidasTomadas} onChange={(e) => setForm({ ...form, medidasTomadas: e.target.value })} className="input min-h-14" />
            </Field>
          </div>
          <div className="col-span-2">
            <Field label="Anexo (URL)">
              <input value={form.anexoUrl} onChange={(e) => setForm({ ...form, anexoUrl: e.target.value })} className="input" />
            </Field>
          </div>
          <div className="col-span-2">
            <Field label="Observação">
              <textarea value={form.observacao} onChange={(e) => setForm({ ...form, observacao: e.target.value })} className="input min-h-14" />
            </Field>
          </div>
        </div>
        <button
          onClick={submit}
          disabled={submitting}
          className="w-full mt-4 bg-nord-blue hover:bg-nord-blue-light disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg py-2.5"
        >
          {submitting ? "Salvando..." : "Salvar"}
        </button>
      </Modal>

      <Modal open={!!detail} onClose={() => setDetail(null)} title={detail ? TYPE_LABEL[detail.type] ?? detail.type : ""}>
        {detail && (
          <div className="space-y-4 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-white font-medium">{detail.employee.name}</span>
              <Badge tone={STATUS_TONE[detail.status]}>{detail.status.replaceAll("_", " ")}</Badge>
            </div>
            <div className="grid grid-cols-2 gap-3 text-xs text-nord-gray">
              <span>Data: {format(new Date(detail.date), "dd/MM/yyyy")}</span>
              <span>Responsável: {detail.createdBy?.name ?? "-"}</span>
              {detail.prazo && <span>Prazo: {format(new Date(detail.prazo), "dd/MM/yyyy")}</span>}
            </div>
            {detail.justificativa && (
              <div>
                <p className="text-xs text-nord-gray mb-1">Descrição completa</p>
                <p className="text-white">{detail.justificativa}</p>
              </div>
            )}
            {detail.medidasTomadas && (
              <div>
                <p className="text-xs text-nord-gray mb-1">Medidas tomadas</p>
                <p className="text-white">{detail.medidasTomadas}</p>
              </div>
            )}
            {detail.observacao && (
              <div>
                <p className="text-xs text-nord-gray mb-1">Observação</p>
                <p className="text-white">{detail.observacao}</p>
              </div>
            )}
            {detail.anexoUrl && (
              <a href={detail.anexoUrl} target="_blank" rel="noreferrer" className="text-nord-blue-light text-xs underline">
                Ver anexo
              </a>
            )}
            <div>
              <p className="text-xs text-nord-gray mb-2">Histórico do colaborador</p>
              {historico.length === 0 && <p className="text-xs text-nord-gray">Sem outras ocorrências.</p>}
              <ul className="space-y-1.5">
                {historico.map((h) => (
                  <li key={h.id} className="flex items-center justify-between text-xs">
                    <span className="text-nord-gray">
                      {format(new Date(h.date), "dd/MM/yyyy")} — {TYPE_LABEL[h.type] ?? h.type}
                    </span>
                    <Badge tone={STATUS_TONE[h.status]}>{h.status.replaceAll("_", " ")}</Badge>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={!!confirmDeleteId}
        title="Excluir ocorrência"
        message="Tem certeza que deseja excluir esta ocorrência?"
        onConfirm={doDelete}
        onCancel={() => setConfirmDeleteId(null)}
        confirmLabel="Excluir"
        danger
      />

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
