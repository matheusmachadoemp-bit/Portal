"use client";

import { useEffect, useState, type FormEvent } from "react";
import { format, parseISO } from "date-fns";
import { Search } from "lucide-react";
import { Badge } from "@/components/ui/stat-card";
import { Toolbar } from "@/components/ui/toolbar";
import { FormError } from "@/components/ui/modal";
import { apiRequest } from "@/lib/api-client";
import {
  RESERVATION_STATUS_LABEL,
  RESERVATION_STATUS_TONE,
  RESERVATION_STATUS_TRANSITIONS,
  RESERVATION_STATUSES,
} from "@/lib/reservas";

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
  tables: { id: string; identificacao: string }[];
};

export function ReservasClient({
  canEdit,
  hasEmpresa,
  multiEmpresa,
  todayKey,
  initialStatus,
  initialDateFrom,
  initialDateTo,
}: {
  canEdit: boolean;
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
            Mesas: r.tables.map((t) => t.identificacao).join(" + "),
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
              <th className="py-2 px-3">Ambiente / Mesa(s)</th>
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
                    <td className="py-2 px-3 text-nord-gray">
                      {r.environment.name}
                      {r.tables.length > 0 && (
                        <span className="text-[11px] text-nord-gray/80"> — {r.tables.map((t) => t.identificacao).join(" + ")}</span>
                      )}
                    </td>
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
    </div>
  );
}
