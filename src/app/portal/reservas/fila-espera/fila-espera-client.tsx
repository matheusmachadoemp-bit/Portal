"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Pencil, Trash2, PhoneCall, XCircle, Clock, Users, CheckCircle2 } from "lucide-react";
import { StatCard, Section, Badge } from "@/components/ui/stat-card";
import { Modal, FormError, ConfirmDialog } from "@/components/ui/modal";
import { apiRequest } from "@/lib/api-client";
import {
  RESERVATION_WAITLIST_STATUS_LABEL,
  RESERVATION_WAITLIST_ACTIVE_STATUSES,
  RESERVATION_WAITLIST_SETTABLE_STATUSES,
} from "@/lib/reservas";

type WaitlistStatus = "AGUARDANDO" | "CONTATADO" | "CONVERTIDO_EM_RESERVA" | "CANCELADO" | "EXPIRADO" | "ATENDIDO";

type WaitlistEntryDTO = {
  id: string;
  customerName: string;
  customerPhone: string;
  partySize: number;
  status: WaitlistStatus;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

type EntryForm = {
  customerName: string;
  customerPhone: string;
  partySize: string;
  notes: string;
  status: WaitlistStatus;
};

const ACTIVE_STATUSES = RESERVATION_WAITLIST_ACTIVE_STATUSES as WaitlistStatus[];
// `CONVERTIDO_EM_RESERVA` não entra mais aqui — ver comentário no `prisma/schema.prisma` acima
// do enum `ReservationWaitlistStatus` ("REDESIGN"): a Fila de Espera não oferece mais nenhuma
// ação em direção a criar uma Reserva, então esse status nunca é escolhido pela tela.
const EDITABLE_STATUS_OPTIONS = RESERVATION_WAITLIST_SETTABLE_STATUSES as WaitlistStatus[];

function emptyEntryForm(): EntryForm {
  return { customerName: "", customerPhone: "", partySize: "", notes: "", status: "AGUARDANDO" };
}

function formatPhoneBR(digits: string): string {
  if (digits.length === 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  if (digits.length === 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return digits;
}

/** "H:MM:SS" (ou "M:SS" enquanto durar menos de uma hora, caso mais comum numa fila de espera de
 * balcão) a partir de uma duração em milissegundos — mesmo espírito do cronômetro vermelho da
 * referência que o Matheus mostrou ("1:21:04"), sem segundos fracionados. */
function formatElapsed(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const mm = String(minutes).padStart(2, "0");
  const ss = String(seconds).padStart(2, "0");
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${minutes}:${ss}`;
}

/** Destaque visual do cronômetro conforme o tempo de espera cresce — sem nenhuma ciência exata
 * por trás (o Matheus só pediu "mais forte/vermelho depois de alguns minutos"): abaixo de 15min
 * fica neutro, 15-30min vira alerta (amarelo), 30min+ vira vermelho — mesmo padrão de cor de
 * `Badge` (`tone="warning"`/`tone="danger"`, `src/components/ui/stat-card.tsx`). */
function elapsedTone(ms: number): string {
  const minutes = ms / 60000;
  if (minutes >= 30) return "text-nord-danger";
  if (minutes >= 15) return "text-nord-warning";
  return "text-white";
}

const STATUS_TONE: Record<WaitlistStatus, "default" | "success" | "warning" | "danger" | "info" | "purple"> = {
  AGUARDANDO: "warning",
  CONTATADO: "info",
  CONVERTIDO_EM_RESERVA: "success",
  CANCELADO: "default",
  EXPIRADO: "danger",
  ATENDIDO: "success",
};

/** Formata minutos (número com decimais) como "Xmin" (ou "Yh Zmin" acima de 1h) — usado só no
 * card de resumo "Tempo médio na fila" (valores curtos, raramente passam de 1h numa fila de
 * balcão, mas o tratamento de hora fica aqui por segurança). */
function formatMinutes(totalMinutes: number): string {
  const rounded = Math.round(totalMinutes);
  if (rounded < 60) return `${rounded}min`;
  const hours = Math.floor(rounded / 60);
  const minutes = rounded % 60;
  return minutes > 0 ? `${hours}h ${minutes}min` : `${hours}h`;
}

export function FilaEsperaClient({
  canCreate,
  canEdit,
  canDelete,
  hasEmpresa,
}: {
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  hasEmpresa: boolean;
}) {
  const [entries, setEntries] = useState<WaitlistEntryDTO[]>([]);
  // Só começa "carregando" se houver loja selecionada — mesmo racional de
  // `ambientes-client.tsx` (sem empresa ativa, a tela nem tenta buscar nada).
  const [loading, setLoading] = useState(hasEmpresa);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [rowError, setRowError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<WaitlistEntryDTO | null>(null);
  const [form, setForm] = useState<EntryForm>(emptyEntryForm());
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [deleting, setDeleting] = useState<WaitlistEntryDTO | null>(null);
  const [cancelling, setCancelling] = useState<WaitlistEntryDTO | null>(null);

  // Relógio compartilhado por toda a lista (um único `setInterval`, em vez de um por card) —
  // cada card só recalcula a própria duração (`nowTs - createdAt`) a cada re-render disparado
  // por este tick, o que mantém o cronômetro "ao vivo" sem precisar recarregar a página.
  const [nowTs, setNowTs] = useState(() => Date.now());
  useEffect(() => {
    const interval = setInterval(() => setNowTs(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  async function load() {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch("/api/reservas/fila-espera");
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setLoadError(json.error ?? "Não foi possível carregar a fila de espera.");
        return;
      }
      setEntries(json.entries ?? []);
    } catch {
      setLoadError("Falha de conexão. Verifique sua internet e tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!hasEmpresa) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carrega a lista no mount
    load();
  }, [hasEmpresa]);

  // A própria API já devolve as entradas ordenadas por `createdAt` ascendente (ver
  // `src/app/api/reservas/fila-espera/route.ts`), então as "ativas" (AGUARDANDO/CONTATADO) já
  // chegam na ordem de chegada — a posição numerada é só o índice dentro deste filtro.
  const activeEntries = useMemo(() => entries.filter((e) => ACTIVE_STATUSES.includes(e.status)), [entries]);
  // Histórico (resolvidas hoje): mais recente primeiro, por quando o status mudou por último.
  const historyEntries = useMemo(
    () =>
      entries
        .filter((e) => !ACTIVE_STATUSES.includes(e.status))
        .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1)),
    [entries]
  );

  // Cards de resumo do topo da tela: calculados a partir do mesmo `historyEntries` acima (sem
  // rota nova) — a API (`GET /api/reservas/fila-espera`) já devolve toda entrada ativa + toda
  // entrada CRIADA hoje, independente do status (ver comentário na rota). Como uma entrada da
  // fila de espera não deveria viver mais que algumas horas (é "a partir de agora", nunca um
  // agendamento futuro — ver comentário de redesign no schema), criada hoje ≈ resolvida hoje na
  // prática; por isso `historyEntries` já serve de proxy razoável pra "resolvida hoje" sem
  // precisar de outro filtro/rota. `EXPIRADO` fica de fora do card "Clientes cancelados" de
  // propósito — é um status conceitualmente diferente (ninguém deu retorno, não necessariamente
  // desistência) e já aparece separado, com o próprio badge, no histórico abaixo.
  const todayStats = useMemo(() => {
    const atendidos = historyEntries.filter((e) => e.status === "ATENDIDO");
    const cancelados = historyEntries.filter((e) => e.status === "CANCELADO");
    const avgWaitMinutes =
      atendidos.length > 0
        ? atendidos.reduce(
            (sum, e) => sum + (new Date(e.updatedAt).getTime() - new Date(e.createdAt).getTime()),
            0
          ) /
          atendidos.length /
          60000
        : null;
    return { atendidosCount: atendidos.length, canceladosCount: cancelados.length, avgWaitMinutes };
  }, [historyEntries]);

  function openCreate() {
    setEditing(null);
    setForm(emptyEntryForm());
    setFormError(null);
    setModalOpen(true);
  }
  function openEdit(entry: WaitlistEntryDTO) {
    setEditing(entry);
    setForm({
      customerName: entry.customerName,
      customerPhone: entry.customerPhone,
      partySize: String(entry.partySize),
      notes: entry.notes ?? "",
      status: entry.status,
    });
    setFormError(null);
    setModalOpen(true);
  }

  async function submit() {
    if (saving) return;
    const customerName = form.customerName.trim();
    const partySize = Number(form.partySize);
    if (!customerName) {
      setFormError("Informe o nome do cliente.");
      return;
    }
    if (!form.customerPhone.replace(/\D/g, "")) {
      setFormError("Informe o telefone do cliente.");
      return;
    }
    if (!Number.isInteger(partySize) || partySize <= 0) {
      setFormError("Informe a quantidade de pessoas (inteiro maior que zero).");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const payload = {
        customerName,
        customerPhone: form.customerPhone,
        partySize,
        notes: form.notes.trim() || null,
        ...(editing ? { status: form.status } : {}),
      };
      const result = editing
        ? await apiRequest(`/api/reservas/fila-espera/${editing.id}`, "PATCH", payload)
        : await apiRequest("/api/reservas/fila-espera", "POST", payload);
      if (!result.ok) {
        setFormError(result.error);
        return;
      }
      setModalOpen(false);
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function quickSetStatus(entry: WaitlistEntryDTO, status: WaitlistStatus) {
    setRowError(null);
    setBusyId(entry.id);
    try {
      const result = await apiRequest(`/api/reservas/fila-espera/${entry.id}`, "PATCH", { status });
      if (!result.ok) {
        setRowError(result.error);
        return;
      }
      await load();
    } finally {
      setBusyId(null);
    }
  }

  async function confirmCancel() {
    if (!cancelling) return;
    await quickSetStatus(cancelling, "CANCELADO");
    setCancelling(null);
  }

  async function confirmDelete() {
    if (!deleting) return;
    setRowError(null);
    setBusyId(deleting.id);
    try {
      const result = await apiRequest(`/api/reservas/fila-espera/${deleting.id}`, "DELETE");
      if (!result.ok) {
        setRowError(result.error);
        return;
      }
      await load();
    } finally {
      setBusyId(null);
      setDeleting(null);
    }
  }

  if (!hasEmpresa) {
    return (
      <Section title="Fila de Espera">
        <p className="text-sm text-nord-gray">Selecione uma loja específica para ver e editar a fila de espera.</p>
      </Section>
    );
  }

  return (
    <div className="space-y-6">
      {!canCreate && (
        <p className="text-xs text-nord-warning bg-nord-warning/10 border border-nord-warning/30 rounded-lg px-3 py-2">
          Seu perfil de permissão só permite visualizar esta tela.
        </p>
      )}

      <FormError message={rowError} />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          label="Tempo médio na fila"
          value={
            loading
              ? "—"
              : todayStats.avgWaitMinutes !== null
                ? formatMinutes(todayStats.avgWaitMinutes)
                : "—"
          }
          icon="Clock"
          hint="Hoje, até sentar"
        />
        <StatCard
          label="Clientes sentaram"
          value={loading ? "—" : String(todayStats.atendidosCount)}
          icon="CheckCircle2"
          color="#22c55e"
          hint="Hoje"
        />
        <StatCard
          label="Clientes cancelados"
          value={loading ? "—" : String(todayStats.canceladosCount)}
          icon="XCircle"
          color="#e5484d"
          hint="Hoje"
        />
      </div>

      <Section
        title="Fila de espera"
        action={
          canCreate && (
            <button onClick={openCreate} className="btn-primary flex items-center gap-1.5 px-3 py-1.5 text-xs">
              <Plus size={13} /> Nova entrada
            </button>
          )
        }
      >
        {loading ? (
          <div className="p-8 text-center text-sm text-nord-gray">Carregando...</div>
        ) : loadError ? (
          <div className="p-8 text-center text-sm text-nord-danger">{loadError}</div>
        ) : (
          <>
            {activeEntries.length === 0 ? (
              <p className="text-sm text-nord-gray py-6 text-center">
                Nenhum cliente esperando agora. Clique em &quot;Nova entrada&quot; quando alguém chegar sem mesa disponível.
              </p>
            ) : (
              <div className="space-y-2">
                {activeEntries.map((entry, index) => {
                  const elapsed = nowTs - new Date(entry.createdAt).getTime();
                  return (
                    <div
                      key={entry.id}
                      className="flex flex-wrap items-center gap-3 rounded-lg border border-nord-border/60 p-3"
                    >
                      <div className="shrink-0 w-9 h-9 rounded-full bg-nord-danger text-white flex items-center justify-center font-bold text-xs">
                        {index + 1}º
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-white font-medium">{entry.customerName}</p>
                        <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                          <Badge tone="default">{formatPhoneBR(entry.customerPhone)}</Badge>
                          {/* Badge com mais destaque que o resto (telefone/status): é a informação
                              operacional mais importante do card — quantas pessoas estão esperando.
                              Tamanho/peso maiores e cor roxa distinta (não usada em mais nada nesta
                              tela) em vez do `Badge tone="default"` genérico usado acima. */}
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-purple-500/20 text-purple-300">
                            <Users size={13} className="inline -mt-0.5" />
                            {entry.partySize} {entry.partySize === 1 ? "pessoa" : "pessoas"}
                          </span>
                          {entry.status === "CONTATADO" && <Badge tone="info">Contatado</Badge>}
                        </div>
                        {entry.notes && <p className="text-xs text-nord-gray mt-1.5">{entry.notes}</p>}
                      </div>
                      {/* Cronômetro no meio da linha do card (entre o nome/badges e as ações) — em
                          telas largas, `sm:flex-1` divide o espaço restante com o bloco do nome
                          (que também é `flex-1`) e centraliza o conteúdo nessa zona, em vez de
                          ficar colado nas ações à direita; em telas estreitas (`flex-wrap`), ocupa
                          a própria linha, centralizado. */}
                      <div className="w-full sm:w-auto sm:flex-1 flex justify-center">
                        <div className="text-center">
                          <div className={`flex items-center justify-center gap-1 font-mono text-base font-semibold ${elapsedTone(elapsed)}`}>
                            <Clock size={14} />
                            {formatElapsed(elapsed)}
                          </div>
                          <p className="text-[10px] text-nord-gray mt-0.5">esperando</p>
                        </div>
                      </div>
                      {canEdit && (
                        <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto justify-end">
                          {entry.status === "AGUARDANDO" && (
                            <button
                              onClick={() => quickSetStatus(entry, "CONTATADO")}
                              disabled={busyId === entry.id}
                              className="text-nord-gray hover:text-nord-blue-light flex items-center gap-1 text-xs disabled:opacity-50"
                              title="Marcar como contatado"
                            >
                              <PhoneCall size={12} /> Contatado
                            </button>
                          )}
                          <button
                            onClick={() => quickSetStatus(entry, "ATENDIDO")}
                            disabled={busyId === entry.id}
                            className="text-nord-gray hover:text-nord-success flex items-center gap-1 text-xs disabled:opacity-50"
                            title="Marcar como sentou (atendido)"
                          >
                            <CheckCircle2 size={12} /> Sentou
                          </button>
                          <button
                            onClick={() => setCancelling(entry)}
                            disabled={busyId === entry.id}
                            className="text-nord-gray hover:text-nord-danger flex items-center gap-1 text-xs disabled:opacity-50"
                            title="Cancelar entrada"
                          >
                            <XCircle size={12} /> Cancelar
                          </button>
                          <button onClick={() => openEdit(entry)} className="text-nord-gray hover:text-white flex items-center gap-1 text-xs">
                            <Pencil size={12} /> Editar
                          </button>
                          {canDelete && (
                            <button
                              onClick={() => setDeleting(entry)}
                              disabled={busyId === entry.id}
                              className="text-nord-gray hover:text-nord-danger disabled:opacity-50"
                              title="Excluir entrada"
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {historyEntries.length > 0 && (
              <div className="mt-6">
                <h4 className="text-xs font-medium text-nord-gray uppercase tracking-wide mb-2">Histórico de hoje</h4>
                <div className="space-y-1.5">
                  {historyEntries.map((entry) => {
                    const waited = new Date(entry.updatedAt).getTime() - new Date(entry.createdAt).getTime();
                    return (
                      <div
                        key={entry.id}
                        className="flex flex-wrap items-center gap-3 rounded-lg border border-nord-border/40 p-2.5 opacity-75"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-sm text-white">
                            {entry.customerName}{" "}
                            <span className="text-xs text-nord-gray">
                              · {formatPhoneBR(entry.customerPhone)} · {entry.partySize} {entry.partySize === 1 ? "pessoa" : "pessoas"}
                            </span>
                          </p>
                          {entry.notes && <p className="text-xs text-nord-gray mt-1">{entry.notes}</p>}
                        </div>
                        <Badge tone={STATUS_TONE[entry.status]}>{RESERVATION_WAITLIST_STATUS_LABEL[entry.status]}</Badge>
                        <span className="text-[11px] text-nord-gray shrink-0">esperou {formatElapsed(waited)}</span>
                        {canEdit && (
                          <div className="flex items-center gap-2 shrink-0">
                            <button onClick={() => openEdit(entry)} className="text-nord-gray hover:text-white" title="Editar">
                              <Pencil size={12} />
                            </button>
                            {canDelete && (
                              <button onClick={() => setDeleting(entry)} className="text-nord-gray hover:text-nord-danger" title="Excluir">
                                <Trash2 size={14} />
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </Section>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? "Editar entrada" : "Nova entrada na fila"}>
        <FormError message={formError} />
        <div className="space-y-4">
          <label className="block">
            <span className="block text-xs text-nord-gray mb-1">Nome do cliente</span>
            <input
              type="text"
              value={form.customerName}
              onChange={(e) => setForm({ ...form, customerName: e.target.value })}
              className="input"
              placeholder="Ex.: Maria Silva"
            />
          </label>
          <label className="block">
            <span className="block text-xs text-nord-gray mb-1">Telefone (com DDD)</span>
            <input
              type="text"
              value={form.customerPhone}
              onChange={(e) => setForm({ ...form, customerPhone: e.target.value })}
              className="input"
              placeholder="Ex.: (11) 98888-7777"
            />
          </label>
          <label className="block">
            <span className="block text-xs text-nord-gray mb-1">Quantidade de pessoas</span>
            <input
              type="number"
              min={1}
              value={form.partySize}
              onChange={(e) => setForm({ ...form, partySize: e.target.value })}
              className="input"
            />
          </label>
          {editing && (
            <label className="block">
              <span className="block text-xs text-nord-gray mb-1">Status</span>
              <select
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value as WaitlistStatus })}
                className="input"
              >
                {EDITABLE_STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {RESERVATION_WAITLIST_STATUS_LABEL[s]}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="block">
            <span className="block text-xs text-nord-gray mb-1">Observações (opcional)</span>
            <textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              className="input"
              rows={3}
              placeholder="Ex.: prefere mesa na varanda, aniversário, etc."
            />
          </label>
          <button
            onClick={submit}
            disabled={saving}
            className="w-full bg-nord-blue hover:bg-nord-blue-light disabled:opacity-50 text-white text-sm font-medium rounded-lg py-2.5"
          >
            {saving ? "Salvando..." : editing ? "Salvar alterações" : "Adicionar à fila"}
          </button>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!cancelling}
        title="Cancelar entrada"
        message={`Marcar a entrada de "${cancelling?.customerName}" como cancelada? Ela sai da fila ativa e passa para o histórico de hoje.`}
        confirmLabel="Cancelar entrada"
        danger
        onConfirm={confirmCancel}
        onCancel={() => setCancelling(null)}
      />

      <ConfirmDialog
        open={!!deleting}
        title="Excluir entrada"
        message={`Tem certeza que deseja excluir a entrada de "${deleting?.customerName}" da fila de espera? Essa ação não pode ser desfeita.`}
        confirmLabel="Excluir"
        danger
        onConfirm={confirmDelete}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}
