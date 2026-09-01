"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarDays, List } from "lucide-react";
import { Toolbar } from "@/components/ui/toolbar";
import { TaskDashboardCards } from "./task-dashboard-cards";
import { TaskFiltersBar, resolvePeriodRange } from "./task-filters";
import { TaskTable } from "./task-table";
import { TaskCalendarView } from "./task-calendar-view";
import { TaskFormModal } from "./task-form-modal";
import { TaskDetailPanel } from "./task-detail-panel";
import { EMPTY_FILTERS, type EmpresaOption, type TaskDTO, type TaskFilters, type UserOption } from "./types";
import { effectiveTaskStatus } from "@/lib/tarefas";

type Tab = "minhas" | "equipe" | "todas";

const MANAGER_ROLES = ["ADMINISTRADOR", "GESTOR", "GERENTE"];
const TEAM_ROLES = ["ADMINISTRADOR", "GESTOR", "GERENTE", "SUPERVISOR"];

export function TarefasClient({
  initialTasks,
  users,
  empresas,
  currentUserId,
  currentUserRole,
}: {
  initialTasks: TaskDTO[];
  users: UserOption[];
  empresas: EmpresaOption[];
  currentUserId: string;
  currentUserRole: string;
}) {
  const canSeeEquipe = TEAM_ROLES.includes(currentUserRole);
  const canSeeTodas = MANAGER_ROLES.includes(currentUserRole);

  const [activeTab, setActiveTab] = useState<Tab>("minhas");
  const [tasks, setTasks] = useState<TaskDTO[]>(initialTasks.filter((t) => t.assignees.some((a) => a.userId === currentUserId)));
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState<TaskFilters>(EMPTY_FILTERS);
  const [view, setView] = useState<"lista" | "calendario">("lista");
  const [showForm, setShowForm] = useState(false);
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);

  const loadTab = useCallback(async (tab: Tab) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/tarefas?view=${tab}`);
      const data = await res.json();
      if (res.ok) setTasks(data.tasks);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTab(activeTab);
  }, [activeTab, loadTab]);

  function refresh() {
    loadTab(activeTab);
  }

  const filteredTasks = useMemo(() => {
    const { from, to } = resolvePeriodRange(filters);
    return tasks.filter((t) => {
      if (filters.empresaId && t.empresaId !== filters.empresaId) return false;
      if (filters.sectorKey && t.sectorKey !== filters.sectorKey) return false;
      if (filters.responsavelId && !t.assignees.some((a) => a.userId === filters.responsavelId)) return false;
      if (filters.priority && t.priority !== filters.priority) return false;
      if (filters.status && effectiveTaskStatus(t) !== filters.status) return false;
      if (filters.q && !t.title.toLowerCase().includes(filters.q.toLowerCase())) return false;
      if (from && (!t.dueDate || new Date(t.dueDate) < new Date(from))) return false;
      if (to && (!t.dueDate || new Date(t.dueDate) > new Date(to))) return false;
      return true;
    });
  }, [tasks, filters]);

  const openTask = useMemo(() => tasks.find((t) => t.id === openTaskId) ?? null, [tasks, openTaskId]);

  return (
    <div className="space-y-5">
      <TaskDashboardCards tasks={tasks} />

      <div className="flex items-center gap-1 border-b border-nord-border">
        <button
          onClick={() => setActiveTab("minhas")}
          className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px ${
            activeTab === "minhas" ? "border-nord-blue text-white" : "border-transparent text-nord-gray hover:text-white"
          }`}
        >
          Minhas tarefas
        </button>
        {canSeeEquipe && (
          <button
            onClick={() => setActiveTab("equipe")}
            className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px ${
              activeTab === "equipe" ? "border-nord-blue text-white" : "border-transparent text-nord-gray hover:text-white"
            }`}
          >
            Equipe
          </button>
        )}
        {canSeeTodas && (
          <button
            onClick={() => setActiveTab("todas")}
            className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px ${
              activeTab === "todas" ? "border-nord-blue text-white" : "border-transparent text-nord-gray hover:text-white"
            }`}
          >
            Todas
          </button>
        )}
      </div>

      <Toolbar
        filters={<TaskFiltersBar filters={filters} onChange={setFilters} users={users} empresas={empresas} showEmpresaFilter={empresas.length > 1} />}
        onRefresh={refresh}
        onAdd={() => setShowForm(true)}
        addLabel="Nova tarefa"
      />

      <div className="flex items-center gap-1 justify-end">
        <button
          onClick={() => setView("lista")}
          className={`btn-outline ${view === "lista" ? "border-nord-blue text-white" : ""}`}
        >
          <List size={13} /> Lista
        </button>
        <button
          onClick={() => setView("calendario")}
          className={`btn-outline ${view === "calendario" ? "border-nord-blue text-white" : ""}`}
        >
          <CalendarDays size={13} /> Calendário
        </button>
      </div>

      <div className="nord-card p-4">
        {loading ? (
          <p className="text-sm text-nord-gray py-8 text-center">Carregando tarefas...</p>
        ) : view === "lista" ? (
          <TaskTable tasks={filteredTasks} onOpen={(t) => setOpenTaskId(t.id)} />
        ) : (
          <TaskCalendarView tasks={filteredTasks} onOpen={(t) => setOpenTaskId(t.id)} />
        )}
      </div>

      <TaskFormModal
        open={showForm}
        onClose={() => setShowForm(false)}
        onCreated={() => {
          setShowForm(false);
          refresh();
        }}
        users={users}
        empresas={empresas}
      />

      <TaskDetailPanel taskId={openTask?.id ?? null} onClose={() => setOpenTaskId(null)} onChanged={refresh} currentUserId={currentUserId} />
    </div>
  );
}
