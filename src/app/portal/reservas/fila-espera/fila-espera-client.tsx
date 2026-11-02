"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Pencil, Trash2, CheckCircle2 } from "lucide-react";
import { Section, Badge } from "@/components/ui/stat-card";
import { Modal, FormError, ConfirmDialog } from "@/components/ui/modal";
import { apiRequest } from "@/lib/api-client";
import { RESERVATION_WAITLIST_STATUS_LABEL, RESERVATION_WAITLIST_STATUSES } from "@/lib/reservas";

type WaitlistStatus = "AGUARDANDO" | "CONTATADO" | "CONVERTIDO_EM_RESERVA" | "CANCELADO" | "EXPIRADO";

type WaitlistEntryDTO = {
  id: string;
  customerName: string;
  customerPhone: string;
  partySize: number;
  desiredDate: string; // "AAAA-MM-DD"
  desiredTime: string | null;
  status: WaitlistStatus;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

type EntryForm = {
  customerName: string;
  customerPhone: string;
  partySize: string;
  desiredDate: string;
  desiredTime: string;
  notes: string;
  status: WaitlistStatus;
};

function emptyEntryForm(): EntryForm {
  return { customerName: "", customerPhone: "", partySize: "", desiredDate: "", desiredTime: "", notes: "", status: "AGUARDANDO" };
}

function formatDateBR(dateKey: string): string {
  if (!dateKey) return "";
  return new Date(`${dateKey}T00:00:00`).toLocaleDateString("pt-BR");
}

function formatPhoneBR(digits: string): string {
  if (digits.length === 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  if (digits.length === 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return digits;
}

const STATUS_TONE: Record<WaitlistStatus, "default" | "success" | "warning" | "danger" | "info" | "purple"> = {
  AGUARDANDO: "warning",
  CONTATADO: "info",
  CONVERTIDO_EM_RESERVA: "success",
  CANCELADO: "default",
  EXPIRADO: "danger",
};

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
  // `mesas-ambientes-client.tsx` (sem empresa ativa, a tela nem tenta buscar nada).
  const [loading, setLoading] = useState(hasEmpresa);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [dateFilter, setDateFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<WaitlistStatus | "">("");

  const [rowError, setRowError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<WaitlistEntryDTO | null>(null);
  const [form, setForm] = useState<EntryForm>(emptyEntryForm());
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [deleting, setDeleting] = useState<WaitlistEntryDTO | null>(null);
  const [converting, setConverting] = useState<WaitlistEntryDTO | null>(null);

  async function load() {
    setLoading(true);
    setLoadError(null);
    try {
      const params = new URLSearchParams();
      if (dateFilter) params.set("date", dateFilter);
      if (statusFilter) params.set("status", statusFilter);
      const query = params.toString();
      const res = await fetch(`/api/reservas/fila-espera${query ? `?${query}` : ""}`);
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
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carrega a lista no mount e a cada troca de filtro
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasEmpresa, dateFilter, statusFilter]);

  const sortedEntries = useMemo(
    () =>
      [...entries].sort((a, b) => {
        if (a.desiredDate !== b.desiredDate) return a.desiredDate < b.desiredDate ? -1 : 1;
        return (a.desiredTime ?? "99:99").localeCompare(b.desiredTime ?? "99:99");
      }),
    [entries]
  );

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
      desiredDate: entry.desiredDate,
      desiredTime: entry.desiredTime ?? "",
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
    if (!form.desiredDate) {
      setFormError("Informe a data desejada.");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const payload = {
        customerName,
        customerPhone: form.customerPhone,
        partySize,
        desiredDate: form.desiredDate,
        desiredTime: form.desiredTime || null,
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

  async function confirmConvert() {
    if (!converting) return;
    setRowError(null);
    setBusyId(converting.id);
    try {
      const result = await apiRequest(`/api/reservas/fila-espera/${converting.id}`, "PATCH", {
        status: "CONVERTIDO_EM_RESERVA",
      });
      if (!result.ok) {
        setRowError(result.error);
        return;
      }
      await load();
    } finally {
      setBusyId(null);
      setConverting(null);
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
        <div className="flex flex-wrap items-end gap-3 mb-4">
          <label className="block">
            <span className="block text-xs text-nord-gray mb-1">Filtrar por data desejada</span>
            <input type="date" value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} className="input" />
          </label>
          <label className="block">
            <span className="block text-xs text-nord-gray mb-1">Filtrar por status</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as WaitlistStatus | "")}
              className="input"
            >
              <option value="">Todos</option>
              {RESERVATION_WAITLIST_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {RESERVATION_WAITLIST_STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </label>
          {(dateFilter || statusFilter) && (
            <button
              onClick={() => {
                setDateFilter("");
                setStatusFilter("");
              }}
              className="text-xs text-nord-gray hover:text-white"
            >
              Limpar filtros
            </button>
          )}
        </div>

        {loading ? (
          <div className="p-8 text-center text-sm text-nord-gray">Carregando...</div>
        ) : loadError ? (
          <div className="p-8 text-center text-sm text-nord-danger">{loadError}</div>
        ) : sortedEntries.length === 0 ? (
          <p className="text-sm text-nord-gray py-2">Nenhuma entrada na fila de espera.</p>
        ) : (
          <div className="space-y-2">
            {sortedEntries.map((entry) => {
              const canAct = entry.status === "AGUARDANDO" || entry.status === "CONTATADO";
              return (
                <div
                  key={entry.id}
                  className="flex flex-wrap items-center gap-3 rounded-lg border border-nord-border/60 p-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-white font-medium">{entry.customerName}</p>
                    <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                      <Badge tone="default">{formatPhoneBR(entry.customerPhone)}</Badge>
                      <Badge tone="default">
                        {entry.partySize} {entry.partySize === 1 ? "pessoa" : "pessoas"}
                      </Badge>
                      <Badge tone="info">
                        {formatDateBR(entry.desiredDate)}
                        {entry.desiredTime ? ` às ${entry.desiredTime}` : " (sem horário fixo)"}
                      </Badge>
                      <Badge tone={STATUS_TONE[entry.status]}>{RESERVATION_WAITLIST_STATUS_LABEL[entry.status]}</Badge>
                    </div>
                    {entry.notes && <p className="text-xs text-nord-gray mt-1.5">{entry.notes}</p>}
                  </div>
                  {canEdit && (
                    <div className="flex items-center gap-2 shrink-0">
                      {canAct && (
                        <button
                          onClick={() => setConverting(entry)}
                          disabled={busyId === entry.id}
                          className="text-nord-gray hover:text-nord-success flex items-center gap-1 text-xs disabled:opacity-50"
                          title="Marcar como convertido em reserva"
                        >
                          <CheckCircle2 size={12} /> Converter em reserva
                        </button>
                      )}
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
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="block text-xs text-nord-gray mb-1">Data desejada</span>
              <input
                type="date"
                value={form.desiredDate}
                onChange={(e) => setForm({ ...form, desiredDate: e.target.value })}
                className="input"
              />
            </label>
            <label className="block">
              <span className="block text-xs text-nord-gray mb-1">Horário desejado (opcional)</span>
              <input
                type="time"
                value={form.desiredTime}
                onChange={(e) => setForm({ ...form, desiredTime: e.target.value })}
                className="input"
              />
            </label>
          </div>
          {editing && (
            <label className="block">
              <span className="block text-xs text-nord-gray mb-1">Status</span>
              <select
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value as WaitlistStatus })}
                className="input"
              >
                {RESERVATION_WAITLIST_STATUSES.map((s) => (
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
        open={!!deleting}
        title="Excluir entrada"
        message={`Tem certeza que deseja excluir a entrada de "${deleting?.customerName}" da fila de espera? Essa ação não pode ser desfeita.`}
        confirmLabel="Excluir"
        danger
        onConfirm={confirmDelete}
        onCancel={() => setDeleting(null)}
      />

      <ConfirmDialog
        open={!!converting}
        title="Converter em reserva"
        message={
          converting
            ? `Crie a reserva de "${converting.customerName}" (${converting.partySize} ${
                converting.partySize === 1 ? "pessoa" : "pessoas"
              }, ${formatDateBR(converting.desiredDate)}${
                converting.desiredTime ? ` às ${converting.desiredTime}` : ""
              }, telefone ${formatPhoneBR(converting.customerPhone)}) na tela de Reservas e confirme aqui para marcar esta entrada como convertida. Esta ação ainda não cria a reserva automaticamente — é só um registro manual do status.`
            : ""
        }
        confirmLabel="Marcar como convertido"
        onConfirm={confirmConvert}
        onCancel={() => setConverting(null)}
      />
    </div>
  );
}
