"use client";

import { useState } from "react";
import { Plus, Trash2, Copy, CheckCheck } from "lucide-react";
import { Section } from "@/components/ui/stat-card";
import { FormError } from "@/components/ui/modal";
import { RESERVATION_WEEKDAY_LABEL, RESERVATION_WEEKDAYS } from "@/lib/reservas";

type WeekdayHourDTO = { dayOfWeek: number; open: boolean; openTime: string; closeTime: string };
type BlockedDateDTO = { id: string; date: string; reason: string | null; createdByName: string | null };
/** 4 parâmetros avançados (tarefa #192) — já existiam em `ReservationSettings` (schema) e já
 * eram lidos pelo motor de disponibilidade (`src/lib/reservas-disponibilidade.ts`), mas nunca
 * tinham sido expostos nesta tela. */
type AdvancedSettingsDTO = {
  minAdvanceMinutes: number;
  maxAdvanceDays: number;
  specialGroupThreshold: number;
  slotIntervalMinutes: number;
};

export function ConfiguracoesClient({
  weekdayHours: initialWeekdayHours,
  blockedDates: initialBlockedDates,
  advancedSettings: initialAdvancedSettings,
  canManage,
  hasEmpresa,
  empresaKey,
}: {
  weekdayHours: WeekdayHourDTO[];
  blockedDates: BlockedDateDTO[];
  advancedSettings: AdvancedSettingsDTO;
  canManage: boolean;
  hasEmpresa: boolean;
  empresaKey: string | null;
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

  const [advancedSettings, setAdvancedSettings] = useState<AdvancedSettingsDTO>(initialAdvancedSettings);
  const [savingAdvanced, setSavingAdvanced] = useState(false);
  const [advancedError, setAdvancedError] = useState<string | null>(null);
  const [advancedSaved, setAdvancedSaved] = useState(false);

  const [newDate, setNewDate] = useState("");
  const [newReason, setNewReason] = useState("");
  const [savingBlock, setSavingBlock] = useState(false);
  const [blockError, setBlockError] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const [copied, setCopied] = useState(false);

  async function copyLink() {
    if (!empresaKey) return;
    await navigator.clipboard.writeText(`${window.location.origin}/reservar/${empresaKey}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  const linkPath = empresaKey ? `/reservar/${empresaKey}` : "";

  function updateDay(dayOfWeek: number, patch: Partial<WeekdayHourDTO>) {
    setWeekdayHours((hours) => hours.map((h) => (h.dayOfWeek === dayOfWeek ? { ...h, ...patch } : h)));
  }

  async function salvarHorarios() {
    setSavingHours(true);
    setHoursError(null);
    setHoursSaved(false);
    // Campo de horário pode ficar vazio se o usuário limpar o <input type="time"> manualmente —
    // trata esse caso ANTES da checagem de "cruzando a meia-noite" abaixo: como string vazia
    // compara como menor que qualquer "HH:mm", um dia com os dois campos vazios (ou só um deles)
    // cairia na comparação `closeTime <= openTime` e mostraria a mensagem errada ("cruzando a
    // meia-noite") quando o problema real é só horário em branco.
    const diaComHorarioEmBranco = weekdayHours.find((w) => w.open && (!w.openTime || !w.closeTime));
    if (diaComHorarioEmBranco) {
      setHoursError(
        `${RESERVATION_WEEKDAY_LABEL[diaComHorarioEmBranco.dayOfWeek]}: informe horário de abertura e fechamento — horário inválido.`
      );
      setSavingHours(false);
      return;
    }
    // Mesma regra validada pela API (PUT /api/reservas/configuracoes): comparação lexicográfica
    // de "HH:mm" (largura fixa) equivale à comparação numérica de minutos do dia. Confere aqui
    // antes de gastar um round-trip ao servidor — a API continua sendo a fonte da verdade.
    const diaCruzandoMeiaNoite = weekdayHours.find((w) => w.open && w.closeTime <= w.openTime);
    if (diaCruzandoMeiaNoite) {
      setHoursError(
        `${RESERVATION_WEEKDAY_LABEL[diaCruzandoMeiaNoite.dayOfWeek]}: horário de fechamento precisa ser depois do de abertura no mesmo dia — configuração cruzando a meia-noite ainda não é suportada.`
      );
      setSavingHours(false);
      return;
    }
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

  function updateAdvanced(patch: Partial<AdvancedSettingsDTO>) {
    setAdvancedSettings((s) => ({ ...s, ...patch }));
  }

  async function salvarAvancado() {
    setSavingAdvanced(true);
    setAdvancedError(null);
    setAdvancedSaved(false);
    // Mesma faixa validada pela API (PUT /api/reservas/configuracoes) — confere aqui antes de
    // gastar um round-trip ao servidor; a API continua sendo a fonte da verdade.
    if (!Number.isInteger(advancedSettings.minAdvanceMinutes) || advancedSettings.minAdvanceMinutes < 0 || advancedSettings.minAdvanceMinutes > 1440) {
      setAdvancedError("Antecedência mínima precisa ser um número inteiro entre 0 e 1440 minutos (24 horas).");
      setSavingAdvanced(false);
      return;
    }
    if (!Number.isInteger(advancedSettings.maxAdvanceDays) || advancedSettings.maxAdvanceDays < 1 || advancedSettings.maxAdvanceDays > 365) {
      setAdvancedError("Prazo máximo de antecedência precisa ser um número inteiro entre 1 e 365 dias.");
      setSavingAdvanced(false);
      return;
    }
    if (!Number.isInteger(advancedSettings.specialGroupThreshold) || advancedSettings.specialGroupThreshold < 1 || advancedSettings.specialGroupThreshold > 100) {
      setAdvancedError("Tamanho de grupo especial precisa ser um número inteiro entre 1 e 100 pessoas.");
      setSavingAdvanced(false);
      return;
    }
    if (!Number.isInteger(advancedSettings.slotIntervalMinutes) || advancedSettings.slotIntervalMinutes < 5 || advancedSettings.slotIntervalMinutes > 240) {
      setAdvancedError("Intervalo entre horários precisa ser um número inteiro entre 5 e 240 minutos.");
      setSavingAdvanced(false);
      return;
    }
    try {
      const res = await fetch("/api/reservas/configuracoes", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(advancedSettings),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setAdvancedError(data.error ?? "Não foi possível salvar as configurações avançadas.");
        return;
      }
      setAdvancedSaved(true);
    } catch {
      setAdvancedError("Não foi possível salvar as configurações avançadas.");
    } finally {
      setSavingAdvanced(false);
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
      <Section title="Link de reserva online">
        {empresaKey ? (
          <div className="space-y-3">
            <p className="text-xs text-nord-gray">
              Envie este link para o cliente fazer a própria reserva, sem precisar ligar ou falar com a loja. O
              botão &quot;Copiar&quot; copia o endereço completo, mesmo que o campo abaixo mostre só o caminho.
            </p>
            <div className="flex items-center gap-2">
              <input
                readOnly
                value={linkPath}
                aria-label="Link da página de reserva pública"
                className="input flex-1 text-xs"
              />
              <button onClick={copyLink} className="btn-outline shrink-0">
                {copied ? <CheckCheck size={13} /> : <Copy size={13} />} {copied ? "Copiado!" : "Copiar"}
              </button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-nord-gray">Selecione uma loja específica para ver o link de reserva dessa loja.</p>
        )}
      </Section>

      <Section title="Dias e horários de atendimento para Reservas">
        <FormError message={hoursError} />
        <p className="text-xs text-nord-gray mb-3">
          Define quando o sistema oferece horário disponível para reserva (página pública e criação manual) — pode
          ser diferente do horário geral de funcionamento da loja.
        </p>
        {!canManage && <p className="text-xs text-nord-warning mb-3">Seu perfil de permissão só permite visualizar.</p>}
        <div className="space-y-2">
          {weekdayHours.map((w) => {
            const dayLabel = RESERVATION_WEEKDAY_LABEL[w.dayOfWeek];
            return (
              <div
                key={w.dayOfWeek}
                className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 px-3 py-2.5 rounded-lg border border-nord-border/50"
              >
                <label className="flex items-center gap-2 sm:w-32 shrink-0 cursor-pointer">
                  <input
                    type="checkbox"
                    className="accent-nord-blue"
                    checked={w.open}
                    disabled={!canManage}
                    onChange={(e) => updateDay(w.dayOfWeek, { open: e.target.checked })}
                  />
                  <span className="text-sm text-white">{dayLabel}</span>
                </label>
                {w.open ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      type="time"
                      value={w.openTime}
                      disabled={!canManage}
                      onChange={(e) => updateDay(w.dayOfWeek, { openTime: e.target.value })}
                      aria-label={`Horário de abertura de ${dayLabel}`}
                      className="input w-28 sm:w-32"
                    />
                    <span className="text-nord-gray text-xs">até</span>
                    <input
                      type="time"
                      value={w.closeTime}
                      disabled={!canManage}
                      onChange={(e) => updateDay(w.dayOfWeek, { closeTime: e.target.value })}
                      aria-label={`Horário de fechamento de ${dayLabel}`}
                      className="input w-28 sm:w-32"
                    />
                  </div>
                ) : (
                  <span className="text-xs text-nord-gray">Fechado</span>
                )}
              </div>
            );
          })}
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

      <Section title="Configurações avançadas">
        <FormError message={advancedError} />
        {!canManage && <p className="text-xs text-nord-warning mb-3">Seu perfil de permissão só permite visualizar.</p>}
        <div className="space-y-4">
          <label className="block">
            <span className="block text-sm text-white mb-0.5">Antecedência mínima (minutos)</span>
            <span className="block text-xs text-nord-gray mb-1.5">
              Quantos minutos antes do horário o cliente precisa reservar. Exemplo: 60 = não aceita reserva para menos
              de 1h de antecedência. Valor entre 0 e 1440 (24 horas).
            </span>
            <input
              type="number"
              min={0}
              max={1440}
              value={advancedSettings.minAdvanceMinutes}
              disabled={!canManage}
              onChange={(e) => updateAdvanced({ minAdvanceMinutes: Number(e.target.value) })}
              aria-label="Antecedência mínima em minutos"
              className="input w-full sm:w-40"
            />
          </label>

          <label className="block">
            <span className="block text-sm text-white mb-0.5">Prazo máximo de antecedência (dias)</span>
            <span className="block text-xs text-nord-gray mb-1.5">
              Até quantos dias no futuro o cliente pode reservar. Exemplo: 60 = reservas só até 60 dias à frente de
              hoje. Valor entre 1 e 365.
            </span>
            <input
              type="number"
              min={1}
              max={365}
              value={advancedSettings.maxAdvanceDays}
              disabled={!canManage}
              onChange={(e) => updateAdvanced({ maxAdvanceDays: Number(e.target.value) })}
              aria-label="Prazo máximo de antecedência em dias"
              className="input w-full sm:w-40"
            />
          </label>

          <label className="block">
            <span className="block text-sm text-white mb-0.5">Grupo especial (pessoas)</span>
            <span className="block text-xs text-nord-gray mb-1.5">
              Reservas com MAIS pessoas do que esse número são marcadas como &quot;grupo especial&quot;. Exemplo: 10 =
              reservas de 11 pessoas ou mais aparecem destacadas como grupo especial. Valor entre 1 e 100.
            </span>
            <input
              type="number"
              min={1}
              max={100}
              value={advancedSettings.specialGroupThreshold}
              disabled={!canManage}
              onChange={(e) => updateAdvanced({ specialGroupThreshold: Number(e.target.value) })}
              aria-label="Tamanho de grupo especial em pessoas"
              className="input w-full sm:w-40"
            />
          </label>

          <label className="block">
            <span className="block text-sm text-white mb-0.5">Intervalo entre horários (minutos)</span>
            <span className="block text-xs text-nord-gray mb-1.5">
              De quantos em quantos minutos aparecem os horários disponíveis para reserva. Exemplo: 30 = horários de
              30 em 30 minutos (18:00, 18:30, 19:00...). Valor entre 5 e 240.
            </span>
            <input
              type="number"
              min={5}
              max={240}
              value={advancedSettings.slotIntervalMinutes}
              disabled={!canManage}
              onChange={(e) => updateAdvanced({ slotIntervalMinutes: Number(e.target.value) })}
              aria-label="Intervalo entre horários em minutos"
              className="input w-full sm:w-40"
            />
          </label>
        </div>
        {canManage && (
          <button
            onClick={salvarAvancado}
            disabled={savingAdvanced}
            className="mt-4 bg-nord-blue hover:bg-nord-blue-light disabled:opacity-50 text-white text-sm font-medium rounded-lg py-2.5 px-4"
          >
            {savingAdvanced ? "Salvando..." : "Salvar configurações avançadas"}
          </button>
        )}
        {advancedSaved && !advancedError && <p className="text-xs text-nord-success mt-2">Configurações avançadas salvas.</p>}
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
