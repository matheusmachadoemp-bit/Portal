"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Search } from "lucide-react";
import { Section, Badge } from "@/components/ui/stat-card";
import { formatNumber } from "@/lib/calc";

type HistoryItem = {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  partySize: number;
  status: string;
  environmentName: string;
};

type ClienteRow = {
  key: string;
  clienteId: string | null;
  nome: string;
  telefone: string | null;
  email: string | null;
  totalReservas: number;
  noShowCount: number;
  canceladaCount: number;
  ultimaReserva: string;
  reservations: HistoryItem[];
};

const STATUS_LABEL: Record<string, string> = {
  PENDENTE: "Pendente",
  CONFIRMADA: "Confirmada",
  CLIENTE_CHEGOU: "Cliente chegou",
  ACOMODADO: "Acomodado",
  FINALIZADA: "Finalizada",
  CANCELADA: "Cancelada",
  NAO_COMPARECEU: "Não compareceu",
};

const STATUS_TONE: Record<string, "default" | "success" | "warning" | "danger" | "info" | "purple"> = {
  PENDENTE: "warning",
  CONFIRMADA: "info",
  CLIENTE_CHEGOU: "info",
  ACOMODADO: "info",
  FINALIZADA: "success",
  CANCELADA: "danger",
  NAO_COMPARECEU: "danger",
};

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

/**
 * Tela "Clientes" do módulo Reservas (Etapa 4) — lista derivada de `Reservation`, agregada pela
 * API (`GET /api/reservas/clientes`, uma única consulta sem N+1 — ver
 * src/lib/reservas-clientes.ts). Clicar num cliente expande o histórico completo de reservas
 * dele inline (accordion), sem precisar de uma 2ª chamada de rede: a API já devolve o histórico
 * de cada cliente na mesma resposta.
 */
export function ClientesReservasClient({ hasEmpresa }: { hasEmpresa: boolean }) {
  const [clientes, setClientes] = useState<ClienteRow[]>([]);
  const [loading, setLoading] = useState(hasEmpresa);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    if (!hasEmpresa) return;
    let active = true;
    async function load() {
      setLoading(true);
      setLoadError(null);
      try {
        const res = await fetch("/api/reservas/clientes");
        const json = await res.json().catch(() => ({}));
        if (!active) return;
        if (!res.ok) {
          setLoadError(json?.error ?? "Não foi possível carregar os clientes.");
          return;
        }
        setClientes(json.clientes ?? []);
      } catch {
        if (active) setLoadError("Falha de conexão. Verifique sua internet e tente novamente.");
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => {
      active = false;
    };
  }, [hasEmpresa]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return clientes;
    return clientes.filter(
      (c) => c.nome.toLowerCase().includes(q) || (c.telefone ?? "").toLowerCase().includes(q)
    );
  }, [clientes, search]);

  if (!hasEmpresa) {
    return (
      <Section title="Clientes">
        <p className="text-sm text-nord-gray">Selecione uma loja específica para ver os clientes de Reservas.</p>
      </Section>
    );
  }

  if (loading) return <div className="nord-card p-8 text-center text-sm text-nord-gray">Carregando...</div>;
  if (loadError) return <div className="nord-card p-8 text-center text-sm text-nord-danger">{loadError}</div>;

  return (
    <div className="space-y-4">
      <Section
        title={`Clientes (${formatNumber(filtered.length)})`}
        action={
          clientes.length > 0 && (
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-nord-gray" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por nome ou telefone..."
                className="input !pl-8 !w-56"
              />
            </div>
          )
        }
      >
        {clientes.length === 0 ? (
          <p className="text-sm text-nord-gray py-6 text-center">
            Nenhuma reserva registrada ainda — os clientes aparecem aqui conforme forem reservando.
          </p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-nord-gray py-6 text-center">Nenhum cliente encontrado para esta busca.</p>
        ) : (
          <div className="space-y-2">
            {filtered.map((c) => {
              const isOpen = expanded === c.key;
              return (
                <div key={c.key} className="rounded-lg border border-nord-border/60 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setExpanded(isOpen ? null : c.key)}
                    className="w-full flex items-center gap-3 p-3 text-left"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-white font-medium truncate">{c.nome}</p>
                      <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                        {c.telefone && <Badge tone="default">{c.telefone}</Badge>}
                        <Badge tone="info">
                          {c.totalReservas} {c.totalReservas === 1 ? "reserva" : "reservas"}
                        </Badge>
                        {c.noShowCount > 0 && (
                          <Badge tone="danger">
                            {c.noShowCount} {c.noShowCount === 1 ? "não compareceu" : "não compareceram"}
                          </Badge>
                        )}
                        {c.canceladaCount > 0 && <Badge tone="warning">{c.canceladaCount} cancelada(s)</Badge>}
                        {!c.clienteId && <Badge tone="purple">Sem cadastro no CRM</Badge>}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs text-nord-gray">Última reserva</p>
                      <p className="text-sm text-white">{formatDate(c.ultimaReserva)}</p>
                    </div>
                    {isOpen ? (
                      <ChevronUp size={16} className="text-nord-gray shrink-0" />
                    ) : (
                      <ChevronDown size={16} className="text-nord-gray shrink-0" />
                    )}
                  </button>
                  {isOpen && (
                    <div className="border-t border-nord-border/60 p-3 space-y-1.5">
                      {c.email && <p className="text-xs text-nord-gray mb-2">E-mail: {c.email}</p>}
                      {c.reservations.map((r) => (
                        <div key={r.id} className="flex items-center justify-between text-sm py-1 flex-wrap gap-1">
                          <span className="text-white">
                            {formatDateTime(r.startTime)} — {r.environmentName}
                          </span>
                          <div className="flex items-center gap-2">
                            <span className="text-nord-gray">
                              {r.partySize} {r.partySize === 1 ? "pessoa" : "pessoas"}
                            </span>
                            <Badge tone={STATUS_TONE[r.status] ?? "default"}>{STATUS_LABEL[r.status] ?? r.status}</Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Section>
    </div>
  );
}
