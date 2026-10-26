"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Section } from "@/components/ui/stat-card";
import { FormError } from "@/components/ui/modal";
import { RESERVATION_WEEKDAY_LABEL, RESERVATION_WEEKDAYS } from "@/lib/reservas";

type WeekdayHourDTO = { dayOfWeek: number; open: boolean; openTime: string; closeTime: string };
type BlockedDateDTO = { id: string; date: string; reason: string | null; createdByName: string | null };

export function ConfiguracoesClient({
  weekdayHours: initialWeekdayHours,
  blockedDates: initialBlockedDates,
  canManage,
  hasEmpresa,
}: {
  weekdayHours: WeekdayHourDTO[];
  blockedDates: BlockedDateDTO[];
  canManage: boolean;
  hasEmpresa: boolean;
}) {
  const [weekdayHours, setWeekdayHours] = useState<WeekdayHourDTO[]>(
    RESERVATION_WEEKDAYS.map(
      (dayOfWeek) =>
        initialWeekdayHours.find((w) => w.dayOfWeek === dayOfWeek) ?? {
          dayOfWeek,
          open: dayOfWeek !== 2,
          openTime: "18:00",
          closeTime: "23:00",
        }
    )
  );
  const [blockedDates, setBlockedDates] = useState(initialBlockedDates);
  const [savingHours, setSavingHours] = useState(false);
  const [hoursError, setHoursError] = useState<string | null>(null);
  const [hoursSaved, setHoursSaved] = useState(false);

  const [newDate, setNewDate] = useState("");
  const [newReason, setNewReason] = useState("");
  const [savingBlock, setSavingBlock] = useState(false);
  const [blockError, setBlockError] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  function updateDay(dayOfWeek: number, patch: Partial<WeekdayHourDTO>) {
    setWeekdayHours((hours) => hours.map((h) => (h.dayOfWeek === dayOfWeek ? { ...h, ...patch } : h)));
  }

  async function salvarHorarios() {
    setSavingHours(true);
    setHoursError(null);
    setHoursSaved(false);
    try {
      const res = await fetch("/api/reservas/configuracoes", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weekdayHours }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setHoursError(data.error ?? "Não foi possível salvar os horários.");
        return;
      }
      setHoursSaved(true);
    } catch {
      setHoursError("Não foi possível salvar os horários.");
    } finally {
      setSavingHours(false);
    }
  }

  async function adicionarBloqueio() {
    if (!newDate) return;
    setSavingBlock(true);
    setBlockError(null);
    try {
      const res = await fetch("/api/reservas/configuracoes/bloqueios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: newDate, reason: newReason || undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setBlockError(data.error ?? "Não foi possível adicionar o bloqueio.");
        return;
      }
      setBlockedDates((list) => [...list, data.blocked].sort((a, b) => a.date.localeCompare(b.date)));
      setNewDate("");
      setNewReason("");
    } catch {
      setBlockError("Não foi possível adicionar o bloqueio.");
    } finally {
      setSavingBlock(false);
    }
  }

  async function removerBloqueio(id: string) {
    setRemovingId(id);
    setBlockError(null);
    try {
      const res = await fetch(`/api/reservas/configuracoes/bloqueios/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setBlockError(data.error ?? "Não foi possível remover o bloqueio.");
        return;
      }
      setBlockedDates((list) => list.filter((b) => b.id !== id));
    } catch {
      setBlockError("Não foi possível remover o bloqueio.");
    } finally {
      setRemovingId(null);
    }
  }

  if (!hasEmpresa) {
    return (
      <Section title="Configurações">
        <p className="text-sm text-nord-gray">Selecione uma loja específica para ver e editar as configurações de Reservas.</p>
      </Section>
    );
  }

  return (
    <div className="space-y-6">
      <Section title="Dias e horários de funcionamento">
        <FormError message={hoursError} />
        {!canManage && <p className="text-xs text-nord-warning mb-3">Seu perfil de permissão só permite visualizar.</p>}
        <div className="space-y-2">
          {weekdayHours.map((w) => (
            <div
              key={w.dayOfWeek}
              className="flex flex-wrap items-center gap-3 px-3 py-2.5 rounded-lg border border-nord-border/50"
            >
              <label className="flex items-center gap-2 w-32 shrink-0 cursor-pointer">
                <input
                  type="checkbox"
                  className="accent-nord-blue"
                  checked={w.open}
                  disabled={!canManage}
                  onChange={(e) => updateDay(w.dayOfWeek, { open: e.target.checked })}
                />
                <span className="text-sm text-white">{RESERVATION_WEEKDAY_LABEL[w.dayOfWeek]}</span>
              </label>
              {w.open ? (
                <div className="flex items-center gap-2">
                  <input
                    type="time"
                    value={w.openTime}
                    disabled={!canManage}
                    onChange={(e) => updateDay(w.dayOfWeek, { openTime: e.target.value })}
                    className="input w-32"
                  />
                  <span className="text-nord-gray text-xs">até</span>
                  <input
                    type="time"
                    value={w.closeTime}
                    disabled={!canManage}
                    onChange={(e) => updateDay(w.dayOfWeek, { closeTime: e.target.value })}
                    className="input w-32"
                  />
                </div>
              ) : (
                <span className="text-xs text-nord-gray">Fechado</span>
              )}
            </div>
          ))}
        </div>
        {canManage && (
          <button
            onClick={salvarHorarios}
            disabled={savingHours}
            className="mt-4 bg-nord-blue hover:bg-nord-blue-light disabled:opacity-50 text-white text-sm font-medium rounded-lg py-2.5 px-4"
          >
            {savingHours ? "Salvando..." : "Salvar horários"}
          </button>
        )}
        {hoursSaved && !hoursError && <p className="text-xs text-nord-success mt-2">Horários salvos.</p>}
      </Section>

      <Section title="Bloqueios de data (feriados e exceções)">
        <FormError message={blockError} />
        {canManage && (
          <div className="flex flex-wrap items-end gap-2 mb-4">
            <label className="block">
              <span className="block text-xs text-nord-gray mb-1">Data</span>
              <input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} className="input" />
            </label>
            <label className="block flex-1 min-w-[180px]">
              <span className="block text-xs text-nord-gray mb-1">Motivo (opcional)</span>
              <input
                value={newReason}
                onChange={(e) => setNewReason(e.target.value)}
                className="input w-full"
                placeholder="Ex.: Natal"
              />
            </label>
            <button
              onClick={adicionarBloqueio}
              disabled={savingBlock || !newDate}
              className="flex items-center gap-1.5 px-3 py-2.5 rounded-lg text-sm bg-nord-blue hover:bg-nord-blue-light disabled:opacity-50 text-white font-medium"
            >
              <Plus size={14} /> Adicionar
            </button>
          </div>
        )}

        {blockedDates.length === 0 ? (
          <p className="text-sm text-nord-gray">Nenhum bloqueio cadastrado.</p>
        ) : (
          <div className="space-y-1.5">
            {blockedDates.map((b) => (
              <div
                key={b.id}
                className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg border border-nord-border/50"
              >
                <div className="min-w-0 flex items-center gap-3">
                  <span className="text-sm text-white font-medium">
                    {new Date(`${b.date}T00:00:00`).toLocaleDateString("pt-BR")}
                  </span>
                  {b.reason && <span className="text-xs text-nord-gray truncate">{b.reason}</span>}
                </div>
                {canManage && (
                  <button
                    onClick={() => removerBloqueio(b.id)}
                    disabled={removingId === b.id}
                    className="text-nord-gray hover:text-nord-danger disabled:opacity-50 shrink-0"
                    title="Remover bloqueio"
                  >
                    <Trash2 size={15} />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}
