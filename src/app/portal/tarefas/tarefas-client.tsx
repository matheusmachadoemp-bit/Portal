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
import { effectiveTaskStatus, isTaskOverdue } from "@/lib/tarefas";

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
  // Começa "true" porque a carga inicial da aba (useEffect logo abaixo) já
  // dispara assim que o componente monta.
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<TaskFilters>(EMPTY_FILTERS);
  const [view, setView] = useState<"lista" | "calendario">("lista");
  const [showForm, setShowForm] = useState(false);
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);

  const loadTab = useCallback(async (tab: Tab) => {
    try {
      const res = await fetch(`/api/tarefas?view=${tab}`);
      const data = await res.json();
      if (res.ok) setTasks(data.tasks);
    } finally {
      setLoading(false);
    }
  }, []);

  // Só a carga inicial (aba "minhas", valor padrão de `activeTab`) roda num
  // efeito. Trocar de aba ou pedir um refresh são reações a clique do
  // usuário — chamam loadTab() direto de dentro do próprio handler
  // (selectTab/refresh abaixo, incluindo o setLoading(true) de cada um),
  // sem precisar de outro efeito reagindo a `activeTab`.
  useEffect(() => {
    loadTab("minhas");
  }, [loadTab]);

  function selectTab(tab: Tab) {
    if (tab === activeTab) return;
    setActiveTab(tab);
    setLoading(true);
    loadTab(tab);
  }

  function refresh() {
    setLoading(true);
    loadTab(activeTab);
  }

  // "Atrasada" depende da hora atual — recalculada aqui (no cliente) a
  // partir de dueDate/status em vez de confiar no valor vindo do servidor,
  // que ou nasce sempre "false" (carga inicial da página, ver page.tsx) ou
  // pode ter ficado velho (dado buscado há um tempo via loadTab).
  const tasksWithOverdue = useMemo(() => tasks.map((t) => ({ ...t, overdue: isTaskOverdue(t) })), [tasks]);

  const filteredTasks = useMemo(() => {
    const { from, to } = resolvePeriodRange(filters);
    return tasksWithOverdue.filter((t) => {
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
  }, [tasksWithOverdue, filters]);

  const openTask = useMemo(() => tasksWithOverdue.find((t) => t.id === openTaskId) ?? null, [tasksWithOverdue, openTaskId]);

  return (
    <div className="space-y-5">
      <TaskDashboardCards tasks={tasksWithOverdue} />

      <div className="flex items-center gap-1 border-b border-nord-border">
        <button
          onClick={() => selectTab("minhas")}
          className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px ${
            activeTab === "minhas" ? "border-nord-blue text-white" : "border-transparent text-nord-gray hover:text-white"
          }`}
        >
          Minhas tarefas
        </button>
        {canSeeEquipe && (
          <button
            onClick={() => selectTab("equipe")}
            className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px ${
              activeTab === "equipe" ? "border-nord-blue text-white" : "border-transparent text-nord-gray hover:text-white"
            }`}
          >
            Equipe
          </button>
        )}
        {canSeeTodas && (
          <button
            onClick={() => selectTab("todas")}
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
