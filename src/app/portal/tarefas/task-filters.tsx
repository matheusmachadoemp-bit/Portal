"use client";

import { Search, X } from "lucide-react";
import { TASK_SECTORS, TASK_PRIORITY_OPTIONS, TASK_STATUS_OPTIONS } from "@/lib/tarefas";
import { EMPTY_FILTERS, type EmpresaOption, type TaskFilters, type UserOption } from "./types";

const PERIOD_OPTIONS = [
  { key: "", label: "Qualquer período" },
  { key: "hoje", label: "Hoje" },
  { key: "amanha", label: "Amanhã" },
  { key: "semana", label: "Esta semana" },
  { key: "proxima-semana", label: "Próxima semana" },
  { key: "mes", label: "Este mês" },
  { key: "personalizado", label: "Personalizado" },
];

export function TaskFiltersBar({
  filters,
  onChange,
  users,
  empresas,
  showEmpresaFilter,
}: {
  filters: TaskFilters;
  onChange: (filters: TaskFilters) => void;
  users: UserOption[];
  empresas: EmpresaOption[];
  showEmpresaFilter: boolean;
}) {
  function set<K extends keyof TaskFilters>(key: K, value: TaskFilters[K]) {
    onChange({ ...filters, [key]: value });
  }

  const hasActiveFilters = JSON.stringify(filters) !== JSON.stringify(EMPTY_FILTERS);

  return (
    <div className="space-y-3">
      <div className="relative max-w-sm">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-nord-gray" />
        <input
          value={filters.q}
          onChange={(e) => set("q", e.target.value)}
          placeholder="Buscar tarefa..."
          className="w-full bg-nord-panel border border-nord-border rounded-lg pl-9 pr-3 py-2 text-sm text-white outline-none focus:border-nord-blue"
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {showEmpresaFilter && (
          <select value={filters.empresaId} onChange={(e) => set("empresaId", e.target.value)} className="filter-select">
            <option value="">Todas as unidades</option>
            {empresas.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        )}

        <select value={filters.sectorKey} onChange={(e) => set("sectorKey", e.target.value)} className="filter-select">
          <option value="">Todos os setores</option>
          {TASK_SECTORS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>

        <select value={filters.responsavelId} onChange={(e) => set("responsavelId", e.target.value)} className="filter-select">
          <option value="">Todos os responsáveis</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>

        <select value={filters.status} onChange={(e) => set("status", e.target.value)} className="filter-select">
          <option value="">Todos os status</option>
          {TASK_STATUS_OPTIONS.map((s) => (
            <option key={s.key} value={s.key}>
              {s.label}
            </option>
          ))}
        </select>

        <select value={filters.priority} onChange={(e) => set("priority", e.target.value)} className="filter-select">
          <option value="">Todas as prioridades</option>
          {TASK_PRIORITY_OPTIONS.map((p) => (
            <option key={p.key} value={p.key}>
              {p.emoji} {p.label}
            </option>
          ))}
        </select>

        <select value={filters.periodo} onChange={(e) => set("periodo", e.target.value)} className="filter-select">
          {PERIOD_OPTIONS.map((p) => (
            <option key={p.key} value={p.key}>
              {p.label}
            </option>
          ))}
        </select>

        {filters.periodo === "personalizado" && (
          <>
            <input type="date" value={filters.from} onChange={(e) => set("from", e.target.value)} className="filter-select" />
            <input type="date" value={filters.to} onChange={(e) => set("to", e.target.value)} className="filter-select" />
          </>
        )}

        {hasActiveFilters && (
          <button
            onClick={() => onChange(EMPTY_FILTERS)}
            className="flex items-center gap-1 text-xs text-nord-gray hover:text-white px-2 py-1.5"
          >
            <X size={13} /> Limpar filtros
          </button>
        )}
      </div>

      <style jsx global>{`
        .filter-select {
          background: var(--nord-panel);
          border: 1px solid var(--nord-border);
          border-radius: 8px;
          padding: 7px 10px;
          color: white;
          font-size: 12px;
          outline: none;
        }
        .filter-select:focus {
          border-color: var(--nord-blue);
        }
      `}</style>
    </div>
  );
}

/** Converte o preset de período em {from, to} ISO para a query da API. */
export function resolvePeriodRange(filters: TaskFilters): { from: string | null; to: string | null } {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  switch (filters.periodo) {
    case "hoje":
      return { from: startOfToday.toISOString(), to: new Date(startOfToday.getTime() + 86400000 - 1).toISOString() };
    case "amanha": {
      const start = new Date(startOfToday.getTime() + 86400000);
      return { from: start.toISOString(), to: new Date(start.getTime() + 86400000 - 1).toISOString() };
    }
    case "semana": {
      const dow = startOfToday.getDay();
      const start = new Date(startOfToday.getTime() - dow * 86400000);
      return { from: start.toISOString(), to: new Date(start.getTime() + 7 * 86400000 - 1).toISOString() };
    }
    case "proxima-semana": {
      const dow = startOfToday.getDay();
      const start = new Date(startOfToday.getTime() + (7 - dow) * 86400000);
      return { from: start.toISOString(), to: new Date(start.getTime() + 7 * 86400000 - 1).toISOString() };
    }
    case "mes": {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
      return { from: start.toISOString(), to: end.toISOString() };
    }
    case "personalizado":
      return { from: filters.from || null, to: filters.to || null };
    default:
      return { from: null, to: null };
  }
}
