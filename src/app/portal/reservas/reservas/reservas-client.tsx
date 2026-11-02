"use client";

import { useEffect, useState, type FormEvent } from "react";
import { format, parseISO } from "date-fns";
import { Search } from "lucide-react";
import { Badge } from "@/components/ui/stat-card";
import { Toolbar } from "@/components/ui/toolbar";
import { Modal, FormError } from "@/components/ui/modal";
import { apiRequest } from "@/lib/api-client";
import { onlyDigits } from "@/lib/reservas";
import {
  RESERVATION_STATUS_LABEL,
  RESERVATION_STATUS_TONE,
  RESERVATION_STATUS_TRANSITIONS,
  RESERVATION_STATUSES,
} from "@/lib/reservas";

type Environment = { id: string; name: string; capacity: number; active: boolean };

type AvailabilitySlot = {
  time: string;
  startTime: string;
  endTime: string;
  withinAdvanceWindow: boolean;
  available: boolean;
};
type DayDetail =
  | { open: false; reason: "bloqueado" | "fechado" | "fora-do-prazo"; blockedReason?: string | null }
  | { open: true; openTime: string; closeTime: string; isSpecialGroup: boolean; slots: AvailabilitySlot[] };

type CreateForm = {
  environmentId: string;
  partySize: string;
  date: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
};

// Mesma formatação simples usada em `reservar-client.tsx` (fluxo público) e `avaliar-client.tsx`
// — só visual, o backend recebe/valida os dígitos (`onlyDigits`); reimplementada aqui porque
// este componente é "use client" e não pode puxar nada que importe o Prisma Client.
function formatTelefone(value: string): string {
  const digits = onlyDigits(value).slice(0, 11);
  if (digits.length <= 2) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

function emptyCreateForm(todayKey: string): CreateForm {
  return { environmentId: "", partySize: "2", date: todayKey, customerName: "", customerPhone: "", customerEmail: "" };
}

export type ReservationDTO = {
  id: string;
  confirmationCode: string;
  date: string;
  startTime: string;
  endTime: string;
  partySize: number;
  status: string;
  customerName: string | null;
  customerPhone: string | null;
  customerEmail: string | null;
  cliente: { id: string; nome: string } | null;
  empresa: { id: string; name: string; color: string };
  environment: { id: string; name: string };
};

export function ReservasClient({
  canEdit,
  canCreate,
  hasEmpresa,
  multiEmpresa,
  todayKey,
  initialStatus,
  initialDateFrom,
  initialDateTo,
}: {
  canEdit: boolean;
  canCreate: boolean;
  hasEmpresa: boolean;
  multiEmpresa: boolean;
  todayKey: string;
  initialStatus: string;
  initialDateFrom: string;
  initialDateTo: string;
}) {
  const [reservations, setReservations] = useState<ReservationDTO[]>([]);
  const [loading, setLoading] = useState(hasEmpresa);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  // ---------------------------------------------------------------------------
  // Criar reserva manualmente (botão "Nova reserva" — ver prompt da tarefa
  // "reservas-criar-manual-calendario"). Reaproveita o motor de disponibilidade já existente via
  // as rotas autenticadas `GET /api/reservas/ambientes` (lista de ambientes) e `GET
  // /api/reservas/disponibilidade` (grade de horários do dia) — nenhuma lógica de disponibilidade
  // reimplementada no cliente.
  // ---------------------------------------------------------------------------
  const [createOpen, setCreateOpen] = useState(false);
  const [environments, setEnvironments] = useState<Environment[]>([]);
  const [environmentsLoaded, setEnvironmentsLoaded] = useState(false);
  const [environmentsError, setEnvironmentsError] = useState<string | null>(null);
  const [createForm, setCreateForm] = useState<CreateForm>(emptyCreateForm(todayKey));
  const [dayDetail, setDayDetail] = useState<DayDetail | null>(null);
  const [loadingDay, setLoadingDay] = useState(false);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  // Padrão "hoje-hoje" só quando a tela é aberta SEM nenhum filtro de data na URL (visita normal,
  // ex. clique no menu) — nunca lista o histórico inteiro sem filtro nenhum. Mas se a URL já trouxe
  // um dos dois (ex. link do card "Pendentes de confirmação" da Visão Geral, que manda só
  // `dateFrom`), respeita o intervalo pedido como veio — inclusive deixando o outro lado em aberto
  // (sem teto de data) — em vez de forçar o lado que faltou pra "hoje" e esconder reservas de dias
  // futuros sem nenhum aviso (achado confirmado pelo Teulis).
  const noDateFilterInUrl = !initialDateFrom && !initialDateTo;
  const [dateFrom, setDateFrom] = useState(initialDateFrom || (noDateFilterInUrl ? todayKey : ""));
  const [dateTo, setDateTo] = useState(initialDateTo || (noDateFilterInUrl ? todayKey : ""));
  const [status, setStatus] = useState(initialStatus);
  const [q, setQ] = useState("");

  // Aceita overrides explícitos (em vez de só ler `dateFrom`/`dateTo`/`status`/`q` do estado)
  // porque `clearFilters` abaixo precisa disparar a busca com os valores NOVOS no mesmo evento
  // em que chama `setQ`/`setStatus`/`setDateFrom`/`setDateTo` — o `set` do React não atualiza o
  // valor capturado por este closure a tempo (só no próximo render), então ler o estado direto
  // aqui pegaria os valores ANTIGOS nesse caso específico.
  async function load(overrides?: { dateFrom?: string; dateTo?: string; status?: string; q?: string }) {
    const f = {
      dateFrom: overrides?.dateFrom ?? dateFrom,
      dateTo: overrides?.dateTo ?? dateTo,
      status: overrides?.status ?? status,
      q: overrides?.q ?? q,
    };
    setLoading(true);
    setLoadError(null);
    try {
      const params = new URLSearchParams();
      if (f.dateFrom) params.set("dateFrom", f.dateFrom);
      if (f.dateTo) params.set("dateTo", f.dateTo);
      if (f.status) params.set("status", f.status);
      const query = f.q.trim();
      if (query) params.set("q", query);
      const res = await fetch(`/api/reservas/reservas?${params.toString()}`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setLoadError(json.error ?? "Não foi possível carregar as reservas.");
        return;
      }
      setReservations(json.reservations ?? []);
    } catch {
      setLoadError("Falha de conexão. Verifique sua internet e tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!hasEmpresa) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carrega a lista no mount e a cada mudança de filtro de data/status (busca por texto é só ao enviar o formulário, ver handleSearchSubmit)
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasEmpresa, dateFrom, dateTo, status]);

  function handleToday() {
    setDateFrom(todayKey);
    setDateTo(todayKey);
  }

  function clearFilters() {
    setQ("");
    setStatus("");
    setDateFrom(todayKey);
    setDateTo(todayKey);
    load({ dateFrom: todayKey, dateTo: todayKey, status: "", q: "" });
  }

  function handleSearchSubmit(e: FormEvent) {
    e.preventDefault();
    load();
  }

  async function changeStatus(r: ReservationDTO, newStatus: string) {
    if (!newStatus) return;
    setRowError(null);
    setBusyId(r.id);
    try {
      const result = await apiRequest<{ reservation: ReservationDTO }>(`/api/reservas/reservas/${r.id}`, "PATCH", {
        status: newStatus,
      });
      if (!result.ok) {
        setRowError(result.error);
        return;
      }
      setReservations((prev) => prev.map((x) => (x.id === r.id ? result.data.reservation : x)));
    } finally {
      setBusyId(null);
    }
  }

  // Carrega a lista de ambientes só quando o modal abre pela 1ª vez (nunca sem necessidade) —
  // reaproveitado em toda reabertura do modal depois disso.
  useEffect(() => {
    if (!createOpen || environmentsLoaded) return;
    let cancelled = false;
    async function loadEnvironments() {
      const res = await apiRequest<{ environments: Environment[] }>("/api/reservas/ambientes", "GET");
      if (cancelled) return;
      setEnvironmentsLoaded(true);
      if (!res.ok) {
        setEnvironmentsError(res.error);
        return;
      }
      const active = res.data.environments.filter((e) => e.active);
      setEnvironments(active);
      setCreateForm((prev) => (prev.environmentId ? prev : { ...prev, environmentId: active[0]?.id ?? "" }));
    }
    loadEnvironments();
    return () => {
      cancelled = true;
    };
  }, [createOpen, environmentsLoaded]);

  // Recarrega a grade de horários do dia sempre que ambiente, data ou quantidade de pessoas
  // mudam — mesmo padrão de `reservar-client.tsx` (fluxo público): a seleção de horário feita
  // antes não vale mais sob um novo ambiente/data/pessoas. `keepSelectedTime` só é usado pelo
  // reload manual depois de um 409 no envio (ver `submitCreate`) — aí sim queremos manter o
  // horário escolhido visível (mesmo que ele apareça indisponível na grade recarregada).
  async function reloadDaySlots(keepSelectedTime = false): Promise<void> {
    const partySize = Number(createForm.partySize);
    if (!createForm.environmentId || !createForm.date || !Number.isInteger(partySize) || partySize < 1) {
      setDayDetail(null);
      return;
    }
    setLoadingDay(true);
    if (!keepSelectedTime) setSelectedTime(null);
    const params = new URLSearchParams({
      ambienteId: createForm.environmentId,
      pessoas: String(partySize),
      data: createForm.date,
    });
    const res = await apiRequest<DayDetail>(`/api/reservas/disponibilidade?${params.toString()}`, "GET");
    setLoadingDay(false);
    if (!res.ok) {
      setCreateError(res.error);
      setDayDetail(null);
      return;
    }
    setDayDetail(res.data);
  }

  useEffect(() => {
    if (!createOpen) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- recarrega a grade de horários a cada troca de ambiente/data/pessoas enquanto o modal está aberto (mesmo padrão do efeito de `load()` da lista principal acima)
    reloadDaySlots();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `reloadDaySlots` lê `createForm` do closure mais recente; redeclarar a dependência completa (a função inteira) dispararia re-fetch a cada tecla digitada em campos que não afetam a disponibilidade (nome/telefone/e-mail)
  }, [createOpen, createForm.environmentId, createForm.date, createForm.partySize]);

  function openCreate() {
    setCreateForm(emptyCreateForm(todayKey));
    setDayDetail(null);
    setSelectedTime(null);
    setCreateError(null);
    setCreateOpen(true);
  }

  async function submitCreate() {
    if (creating) return;
    setCreateError(null);
    const partySize = Number(createForm.partySize);
    const customerName = createForm.customerName.trim();
    const phoneDigits = onlyDigits(createForm.customerPhone);
    if (!createForm.environmentId) return setCreateError("Escolha o ambiente.");
    if (!Number.isInteger(partySize) || partySize < 1) return setCreateError("Informe a quantidade de pessoas (inteiro maior que zero).");
    if (!createForm.date) return setCreateError("Informe a data.");
    if (!selectedTime) return setCreateError("Escolha um horário disponível.");
    if (!customerName) return setCreateError("Informe o nome do cliente.");
    if (phoneDigits.length < 10 || phoneDigits.length > 11) return setCreateError("Informe um telefone válido, com DDD.");

    setCreating(true);
    try {
      const result = await apiRequest<{ reservation: ReservationDTO }>("/api/reservas/reservas", "POST", {
        environmentId: createForm.environmentId,
        date: createForm.date,
        time: selectedTime,
        partySize,
        customerName,
        customerPhone: phoneDigits,
        customerEmail: createForm.customerEmail.trim() || undefined,
      });
      if (!result.ok) {
        setCreateError(result.error);
        // Disponibilidade pode ter ficado desatualizada entre a seleção e o envio — refaz a
        // consulta do dia pra mostrar os horários realmente livres agora, igual o fluxo público.
        await reloadDaySlots(true);
        return;
      }
      setCreateOpen(false);
      await load();
    } finally {
      setCreating(false);
    }
  }

  if (!hasEmpresa) {
    return <div className="nord-card p-8 text-center text-sm text-nord-gray">Selecione uma loja para ver as reservas.</div>;
  }

  const columnCount = 6 + (multiEmpresa ? 1 : 0) + (canEdit ? 1 : 0);

  return (
    <div className="space-y-4">
      {multiEmpresa && (
        <p className="text-xs text-nord-warning bg-nord-warning/10 border border-nord-warning/30 rounded-lg px-3 py-2">
          Modo Grupo Nord: mostrando reservas de todas as lojas, somente leitura. Selecione uma loja específica para
          mudar o status de uma reserva.
        </p>
      )}
      {!canEdit && !multiEmpresa && (
        <p className="text-xs text-nord-warning bg-nord-warning/10 border border-nord-warning/30 rounded-lg px-3 py-2">
          Seu perfil de permissão só permite visualizar esta tela.
        </p>
      )}

      <Toolbar
        filters={
          <>
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="input w-auto" />
            <span className="text-nord-gray text-xs">até</span>
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="input w-auto" />
            <button type="button" className="btn-outline text-xs px-2.5 py-1.5" onClick={handleToday}>
              Hoje
            </button>
            <select value={status} onChange={(e) => setStatus(e.target.value)} className="input w-auto">
              <option value="">Todos os status</option>
              {RESERVATION_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {RESERVATION_STATUS_LABEL[s]}
                </option>
              ))}
            </select>
            <form onSubmit={handleSearchSubmit} className="flex items-center gap-1.5">
              <input
                type="text"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Nome, telefone ou código"
                className="input w-44"
              />
              <button type="submit" className="btn-outline p-2" aria-label="Buscar">
                <Search size={13} />
              </button>
            </form>
            <button type="button" className="btn-outline text-xs px-2.5 py-1.5" onClick={clearFilters}>
              Limpar filtros
            </button>
          </>
        }
        onAdd={canCreate ? openCreate : undefined}
        addLabel="Nova reserva"
        exportFilename="reservas"
        exportSheetName="Reservas"
        exportRows={() =>
          reservations.map((r) => ({
            Código: r.confirmationCode,
            Data: format(parseISO(r.date), "dd/MM/yyyy"),
            Horário: `${format(parseISO(r.startTime), "HH:mm")}–${format(parseISO(r.endTime), "HH:mm")}`,
            Cliente: r.customerName ?? r.cliente?.nome ?? "",
            Telefone: r.customerPhone ?? "",
            Pessoas: r.partySize,
            Ambiente: r.environment.name,
            Status: RESERVATION_STATUS_LABEL[r.status] ?? r.status,
            ...(multiEmpresa ? { Loja: r.empresa.name } : {}),
          }))
        }
        onRefresh={load}
      />

      <FormError message={rowError} />

      <div className="nord-card overflow-x-auto nord-scrollbar">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-nord-gray border-b border-nord-border">
              <th className="py-2 px-3">Data</th>
              <th className="py-2 px-3">Horário</th>
              <th className="py-2 px-3">Cliente</th>
              <th className="py-2 px-3">Pessoas</th>
              <th className="py-2 px-3">Ambiente</th>
              <th className="py-2 px-3">Status</th>
              {multiEmpresa && <th className="py-2 px-3">Loja</th>}
              {canEdit && <th className="py-2 px-3">Ações</th>}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={columnCount} className="py-8 text-center text-nord-gray text-sm">
                  Carregando...
                </td>
              </tr>
            ) : loadError ? (
              <tr>
                <td colSpan={columnCount} className="py-8 text-center text-nord-danger text-sm">
                  {loadError}
                </td>
              </tr>
            ) : reservations.length === 0 ? (
              <tr>
                <td colSpan={columnCount} className="py-8 text-center text-nord-gray text-sm">
                  Nenhuma reserva encontrada para este filtro.
                </td>
              </tr>
            ) : (
              reservations.map((r) => {
                const nextStatuses = RESERVATION_STATUS_TRANSITIONS[r.status] ?? [];
                return (
                  <tr key={r.id} className="border-b border-nord-border/50">
                    <td className="py-2 px-3 text-white whitespace-nowrap">{format(parseISO(r.date), "dd/MM/yyyy")}</td>
                    <td className="py-2 px-3 text-nord-gray whitespace-nowrap">
                      {format(parseISO(r.startTime), "HH:mm")}–{format(parseISO(r.endTime), "HH:mm")}
                    </td>
                    <td className="py-2 px-3">
                      <p className="text-white">{r.customerName ?? r.cliente?.nome ?? "—"}</p>
                      {r.customerPhone && <p className="text-[11px] text-nord-gray">{r.customerPhone}</p>}
                    </td>
                    <td className="py-2 px-3 text-nord-gray">{r.partySize}</td>
                    <td className="py-2 px-3 text-nord-gray">{r.environment.name}</td>
                    <td className="py-2 px-3">
                      <Badge tone={RESERVATION_STATUS_TONE[r.status] ?? "default"}>
                        {RESERVATION_STATUS_LABEL[r.status] ?? r.status}
                      </Badge>
                    </td>
                    {multiEmpresa && (
                      <td className="py-2 px-3">
                        <span className="text-[11px] font-medium" style={{ color: r.empresa.color }}>
                          {r.empresa.name}
                        </span>
                      </td>
                    )}
                    {canEdit && (
                      <td className="py-2 px-3">
                        {nextStatuses.length > 0 ? (
                          <select
                            value=""
                            disabled={busyId === r.id}
                            onChange={(e) => changeStatus(r, e.target.value)}
                            className="input text-xs py-1 w-auto disabled:opacity-50"
                          >
                            <option value="" disabled>
                              {busyId === r.id ? "Salvando..." : "Mudar status..."}
                            </option>
                            {nextStatuses.map((s) => (
                              <option key={s} value={s}>
                                {RESERVATION_STATUS_LABEL[s] ?? s}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className="text-[11px] text-nord-gray">—</span>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Nova reserva" closeDisabled={creating}>
        <FormError message={createError} />
        {environmentsError && <FormError message={environmentsError} />}
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="block text-xs text-nord-gray mb-1">Ambiente</span>
              <select
                value={createForm.environmentId}
                onChange={(e) => setCreateForm({ ...createForm, environmentId: e.target.value })}
                className="input"
                disabled={!environmentsLoaded}
              >
                {!environmentsLoaded && <option value="">Carregando...</option>}
                {environmentsLoaded && environments.length === 0 && <option value="">Nenhum ambiente ativo cadastrado</option>}
                {environments.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="block text-xs text-nord-gray mb-1">Quantidade de pessoas</span>
              <input
                type="number"
                min={1}
                value={createForm.partySize}
                onChange={(e) => setCreateForm({ ...createForm, partySize: e.target.value })}
                className="input"
              />
            </label>
          </div>

          <label className="block">
            <span className="block text-xs text-nord-gray mb-1">Data</span>
            <input
              type="date"
              value={createForm.date}
              onChange={(e) => setCreateForm({ ...createForm, date: e.target.value })}
              className="input"
            />
          </label>

          <div>
            <span className="block text-xs text-nord-gray mb-1">Horário</span>
            {loadingDay && <p className="text-xs text-nord-gray">Carregando horários...</p>}
            {!loadingDay && dayDetail?.open && (
              <>
                {dayDetail.isSpecialGroup && (
                  <p className="text-[11px] text-amber-400 mb-2">
                    Grupo grande — a disponibilidade de horários pode ser mais limitada.
                  </p>
                )}
                <div className="grid grid-cols-4 gap-1.5">
                  {dayDetail.slots.map((s) => (
                    <button
                      key={s.time}
                      type="button"
                      disabled={!s.available}
                      onClick={() => setSelectedTime(s.time)}
                      className={`py-1.5 rounded-lg text-xs font-medium border transition ${
                        selectedTime === s.time
                          ? "bg-nord-blue border-nord-blue text-white"
                          : s.available
                            ? "bg-transparent border-nord-border text-white hover:border-white/30"
                            : "bg-transparent border-nord-border/40 text-nord-gray/30 line-through"
                      }`}
                    >
                      {s.time}
                    </button>
                  ))}
                </div>
                {dayDetail.slots.every((s) => !s.available) && (
                  <p className="text-nord-gray text-xs mt-1">Nenhum horário livre neste dia para esse ambiente/quantidade.</p>
                )}
              </>
            )}
            {!loadingDay && dayDetail && !dayDetail.open && (
              <p className="text-nord-gray text-xs">
                {dayDetail.reason === "bloqueado" && (dayDetail.blockedReason || "Esta data não está disponível para reservas.")}
                {dayDetail.reason === "fechado" && "Fechado neste dia."}
                {dayDetail.reason === "fora-do-prazo" && "Fora do prazo de antecedência configurado para reservas."}
              </p>
            )}
            {!loadingDay && !dayDetail && (
              <p className="text-nord-gray text-xs">Escolha ambiente, data e quantidade de pessoas para ver os horários.</p>
            )}
          </div>

          <label className="block">
            <span className="block text-xs text-nord-gray mb-1">Nome do cliente</span>
            <input
              type="text"
              value={createForm.customerName}
              onChange={(e) => setCreateForm({ ...createForm, customerName: e.target.value })}
              className="input"
              placeholder="Ex.: Maria Silva"
            />
          </label>
          <label className="block">
            <span className="block text-xs text-nord-gray mb-1">Telefone (com DDD)</span>
            <input
              type="text"
              value={createForm.customerPhone}
              onChange={(e) => setCreateForm({ ...createForm, customerPhone: formatTelefone(e.target.value) })}
              className="input"
              placeholder="(00) 00000-0000"
            />
          </label>
          <label className="block">
            <span className="block text-xs text-nord-gray mb-1">E-mail (opcional)</span>
            <input
              type="email"
              value={createForm.customerEmail}
              onChange={(e) => setCreateForm({ ...createForm, customerEmail: e.target.value })}
              className="input"
              placeholder="cliente@exemplo.com"
            />
          </label>

          <button
            onClick={submitCreate}
            disabled={creating}
            className="w-full bg-nord-blue hover:bg-nord-blue-light disabled:opacity-50 text-white text-sm font-medium rounded-lg py-2.5"
          >
            {creating ? "Criando..." : "Criar reserva"}
          </button>
        </div>
      </Modal>
    </div>
  );
}
