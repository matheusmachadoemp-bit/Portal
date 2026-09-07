"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, Clock, Play, Search } from "lucide-react";
import { Badge } from "@/components/ui/stat-card";
import { DynamicIcon } from "@/components/dynamic-icon";
import {
  compareProductionOrders,
  effectiveProductionStatus,
  PRODUCTION_PRIORITY_COLOR,
  PRODUCTION_PRIORITY_LABEL,
  PRODUCTION_STATUS_LABEL,
  PRODUCTION_STATUS_TONE,
} from "@/lib/producao";
import type { ProductionOrderDTO, CategoriaOption, UserOption } from "../types";
import { FinalizarModal } from "./finalizar-modal";

type StatusFilter = "TODOS" | "PENDENTE" | "EM_PRODUCAO" | "CONCLUIDO" | "ATRASADO";

const STATUS_TABS: { key: StatusFilter; label: string }[] = [
  { key: "TODOS", label: "Todos" },
  { key: "PENDENTE", label: "Pendentes" },
  { key: "EM_PRODUCAO", label: "Em produção" },
  { key: "CONCLUIDO", label: "Concluídos" },
  { key: "ATRASADO", label: "Atrasados" },
];

export function HojeClient({
  initialOrdens,
  categorias,
  teamMembers,
}: {
  initialOrdens: ProductionOrderDTO[];
  categorias: CategoriaOption[];
  teamMembers: UserOption[];
}) {
  const [ordens, setOrdens] = useState(initialOrdens);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("TODOS");
  const [categoriaFilter, setCategoriaFilter] = useState("");
  const [responsavelFilter, setResponsavelFilter] = useState("");
  const [search, setSearch] = useState("");
  const [finalizando, setFinalizando] = useState<ProductionOrderDTO | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  async function refresh() {
    const res = await fetch("/api/producao/ordens");
    const data = await res.json();
    setOrdens(data.ordens);
  }

  async function iniciar(ordem: ProductionOrderDTO) {
    setLoadingId(ordem.id);
    try {
      const res = await fetch(`/api/producao/ordens/${ordem.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "iniciar" }),
      });
      if (res.ok) await refresh();
    } finally {
      setLoadingId(null);
    }
  }

  const filtered = useMemo(() => {
    return ordens
      .map((o) => ({ ...o, status: effectiveProductionStatus({ prazo: o.prazo, status: o.status }) }))
      .filter((o) => {
        if (statusFilter !== "TODOS" && o.status !== statusFilter) return false;
        if (categoriaFilter && o.productionItem.category.id !== categoriaFilter) return false;
        if (responsavelFilter && o.responsavelId !== responsavelFilter) return false;
        if (search && !o.productionItem.name.toLowerCase().includes(search.toLowerCase())) return false;
        return true;
      })
      .sort(compareProductionOrders);
  }, [ordens, statusFilter, categoriaFilter, responsavelFilter, search]);

  return (
    <div className="space-y-4">
      <div className="flex gap-1.5 flex-wrap">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setStatusFilter(tab.key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium ${
              statusFilter === tab.key ? "bg-nord-blue text-white" : "bg-nord-panel text-nord-gray hover:text-white"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[180px]">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-nord-gray" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar produto..."
            className="input pl-8"
          />
        </div>
        <select value={categoriaFilter} onChange={(e) => setCategoriaFilter(e.target.value)} className="input w-auto">
          <option value="">Todas as categorias</option>
          {categorias.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select value={responsavelFilter} onChange={(e) => setResponsavelFilter(e.target.value)} className="input w-auto">
          <option value="">Todos os responsáveis</option>
          {teamMembers.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
        {filtered.map((ordem) => {
          const quantidade = ordem.quantidadeAprovada ?? ordem.quantidadeSugerida;
          const prazoLabel = new Date(ordem.prazo).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
          return (
            <div key={ordem.id} className="nord-card p-4 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <DynamicIcon name={ordem.productionItem.category.icon} size={16} style={{ color: ordem.productionItem.category.color }} />
                  <p className="text-sm font-semibold text-white">{ordem.productionItem.name}</p>
                </div>
                <Badge tone={PRODUCTION_STATUS_TONE[ordem.status] ?? "default"}>{PRODUCTION_STATUS_LABEL[ordem.status] ?? ordem.status}</Badge>
              </div>

              <div className="flex items-baseline gap-2">
                <span className="text-[11px] text-nord-gray uppercase tracking-wide">Produzir</span>
                <span className="text-2xl font-semibold tracking-tight text-white">
                  {quantidade} <span className="text-sm text-nord-gray">{ordem.productionItem.unidade}</span>
                </span>
              </div>

              {ordem.quantidadeProduzida !== null && (
                <p className="text-xs text-nord-gray">
                  Produzido: <span className="text-white font-medium">{ordem.quantidadeProduzida}</span> {ordem.productionItem.unidade}
                </p>
              )}

              <div className="flex items-center justify-between text-xs text-nord-gray">
                <span className="flex items-center gap-1">
                  <Clock size={12} /> Até {prazoLabel}
                </span>
                <span className="font-medium" style={{ color: PRODUCTION_PRIORITY_COLOR[ordem.prioridade] }}>
                  {PRODUCTION_PRIORITY_LABEL[ordem.prioridade] ?? ordem.prioridade}
                </span>
              </div>

              {ordem.status === "ATRASADO" && (
                <p className="flex items-center gap-1 text-xs text-red-400">
                  <AlertTriangle size={12} /> Prazo vencido
                </p>
              )}

              <p className="text-xs text-nord-gray">Responsável: {ordem.responsavel?.name ?? "—"}</p>

              {ordem.status === "PENDENTE" && (
                <button
                  onClick={() => iniciar(ordem)}
                  disabled={loadingId === ordem.id}
                  className="w-full flex items-center justify-center gap-1.5 bg-nord-blue hover:bg-nord-blue-light disabled:opacity-50 text-white text-sm font-medium rounded-lg py-2.5"
                >
                  <Play size={14} /> Iniciar Produção
                </button>
              )}
              {(ordem.status === "EM_PRODUCAO" || ordem.status === "ATRASADO") && (
                <button
                  onClick={() => setFinalizando(ordem)}
                  className="w-full flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium rounded-lg py-2.5"
                >
                  Finalizar Produção
                </button>
              )}
            </div>
          );
        })}
        {filtered.length === 0 && (
          <p className="col-span-full text-center text-sm text-nord-gray py-10">Nenhuma produção encontrada com esses filtros.</p>
        )}
      </div>

      {finalizando && (
        <FinalizarModal
          ordem={finalizando}
          onClose={() => setFinalizando(null)}
          onDone={() => {
            setFinalizando(null);
            refresh();
          }}
        />
      )}
    </div>
  );
}
