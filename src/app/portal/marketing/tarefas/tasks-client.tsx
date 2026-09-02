"use client";

import { useMemo, useState } from "react";
import { Plus, LayoutGrid, List as ListIcon, History } from "lucide-react";
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { TaskModal } from "../task-modal";
import { Section, Badge, ProgressBar } from "@/components/ui/stat-card";
import { DynamicIcon } from "@/components/dynamic-icon";
import {
  KANBAN_COLUMNS,
  PRIORITY_COLOR,
  PRIORITY_LABEL,
  STATUS_COLOR,
  STATUS_LABEL,
  checklistProgress,
} from "@/lib/marketing";
import type { TaskDTO, TeamMember } from "../marketing-types";
import { format, isToday, isTomorrow, isPast, isThisWeek, isThisMonth, parseISO } from "date-fns";

type FilterKey = "todas" | "hoje" | "amanha" | "semana" | "mes" | "atrasadas" | "concluidas" | "andamento";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "todas", label: "Todas" },
  { key: "hoje", label: "Hoje" },
  { key: "amanha", label: "Amanhã" },
  { key: "semana", label: "Esta semana" },
  { key: "mes", label: "Este mês" },
  { key: "atrasadas", label: "Atrasadas" },
  { key: "andamento", label: "Em andamento" },
  { key: "concluidas", label: "Concluídas" },
];

const DONE = ["PUBLICADO", "RESULTADOS"];

type HistoryEntry = {
  id: string;
  action: string;
  before: string | null;
  after: string | null;
  userName: string;
  createdAt: string;
};

export function TasksClient({
  initialTasks,
  teamMembers,
  campaigns,
  canCreate,
  history,
}: {
  initialTasks: TaskDTO[];
  teamMembers: TeamMember[];
  campaigns: { id: string; name: string }[];
  canCreate: boolean;
  history: HistoryEntry[];
}) {
  const [tasks, setTasks] = useState(initialTasks);
  const [taskHistory, setTaskHistory] = useState(history);
  const [view, setView] = useState<"kanban" | "lista">("kanban");
  const [filter, setFilter] = useState<FilterKey>("todas");
  const [showModal, setShowModal] = useState(false);
  const [editingTask, setEditingTask] = useState<TaskDTO | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  async function refresh() {
    const [tasksRes, historyRes] = await Promise.all([
      fetch("/api/marketing/tasks"),
      fetch("/api/marketing/tasks/history"),
    ]);
    const data = await tasksRes.json();
    setTasks(data.tasks.map((t: TaskDTO) => t));
    const historyData = await historyRes.json();
    if (historyData.history) setTaskHistory(historyData.history);
  }

  const filtered = useMemo(() => {
    return tasks.filter((t) => {
      if (filter === "todas") return true;
      if (filter === "concluidas") return DONE.includes(t.status);
      if (filter === "andamento") return !DONE.includes(t.status);
      if (!t.date) return false;
      const d = parseISO(t.date);
      if (filter === "hoje") return isToday(d);
      if (filter === "amanha") return isTomorrow(d);
      if (filter === "semana") return isThisWeek(d, { weekStartsOn: 1 });
      if (filter === "mes") return isThisMonth(d);
      if (filter === "atrasadas") return isPast(d) && !isToday(d) && !DONE.includes(t.status);
      return true;
    });
  }, [tasks, filter]);

  function openNew() {
    setEditingTask(null);
    setShowModal(true);
  }
  function openEdit(t: TaskDTO) {
    setEditingTask(t);
    setShowModal(true);
  }

  async function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    setActiveId(null);
    if (!over) return;
    const taskId = String(active.id);
    const newStatus = String(over.id);
    const task = tasks.find((t) => t.id === taskId);
    if (!task || task.status === newStatus) return;
    setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, status: newStatus } : t)));
    const res = await fetch(`/api/marketing/tasks/${taskId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    const data = await res.json();
    if (data.historyEntry) setTaskHistory((prev) => [data.historyEntry, ...prev]);
  }

  const activeTask = tasks.find((t) => t.id === activeId);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex gap-1.5 flex-wrap">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-medium ${
                filter === f.key ? "bg-nord-blue text-white" : "bg-nord-panel text-nord-gray hover:text-white"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-nord-border overflow-hidden">
            <button
              onClick={() => setView("kanban")}
              className={`p-1.5 ${view === "kanban" ? "bg-nord-blue text-white" : "text-nord-gray hover:text-white"}`}
            >
              <LayoutGrid size={14} />
            </button>
            <button
              onClick={() => setView("lista")}
              className={`p-1.5 ${view === "lista" ? "bg-nord-blue text-white" : "text-nord-gray hover:text-white"}`}
            >
              <ListIcon size={14} />
            </button>
          </div>
          {canCreate && (
            <button
              onClick={openNew}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-nord-blue hover:bg-nord-blue-light text-white font-medium"
            >
              <Plus size={13} /> Nova tarefa
            </button>
          )}
        </div>
      </div>

      {view === "kanban" ? (
        <DndContext
          sensors={sensors}
          onDragStart={(e: DragStartEvent) => setActiveId(String(e.active.id))}
          onDragEnd={handleDragEnd}
        >
          <div className="flex gap-3 overflow-x-auto nord-scrollbar pb-2">
            {KANBAN_COLUMNS.map((col) => (
              <KanbanColumn
                key={col.key}
                columnKey={col.key}
                label={col.label}
                icon={col.icon}
                color={col.color}
                tasks={filtered.filter((t) => t.status === col.key)}
                onOpen={openEdit}
              />
            ))}
          </div>
          <DragOverlay>{activeTask && <TaskCard task={activeTask} onOpen={() => {}} dragging />}</DragOverlay>
        </DndContext>
      ) : (
        <div className="nord-card overflow-x-auto nord-scrollbar">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-nord-gray border-b border-nord-border">
                <th className="py-2 px-3">Título</th>
                <th className="py-2 px-3">Status</th>
                <th className="py-2 px-3">Prioridade</th>
                <th className="py-2 px-3">Responsável</th>
                <th className="py-2 px-3">Data</th>
                <th className="py-2 px-3">Checklist</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((t) => (
                <tr
                  key={t.id}
                  onClick={() => openEdit(t)}
                  className="border-b border-nord-border/50 hover:bg-white/5 cursor-pointer"
                >
                  <td className="py-2 px-3 text-white">{t.title}</td>
                  <td className="py-2 px-3">
                    <span
                      className="text-[11px] px-2 py-0.5 rounded-full"
                      style={{ backgroundColor: `${STATUS_COLOR[t.status] ?? "#2952E3"}22`, color: STATUS_COLOR[t.status] ?? "#fff" }}
                    >
                      {t.status}
                    </span>
                  </td>
                  <td className="py-2 px-3">
                    <span className="text-[11px]" style={{ color: PRIORITY_COLOR[t.priority] }}>
                      {PRIORITY_LABEL[t.priority] ?? t.priority}
                    </span>
                  </td>
                  <td className="py-2 px-3 text-nord-gray">{t.responsavel?.name ?? "—"}</td>
                  <td className="py-2 px-3 text-nord-gray">{t.date ? format(parseISO(t.date), "dd/MM/yyyy") : "—"}</td>
                  <td className="py-2 px-3 w-32">
                    <ProgressBar percent={checklistProgress(t.checklist)} />
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-nord-gray text-sm">
                    Nenhuma tarefa encontrada para este filtro.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <Section title="Histórico de movimentação">
        <div className="space-y-2 max-h-[420px] overflow-y-auto nord-scrollbar">
          {taskHistory.map((h) => {
            const isCreate = h.action === "CREATE";
            const [title, newStatusKey] = isCreate ? [h.after ?? "", null] : (h.after ?? "").split(" → ");
            const fromLabel = h.before ? (STATUS_LABEL[h.before] ?? h.before) : null;
            const toLabel = newStatusKey ? (STATUS_LABEL[newStatusKey] ?? newStatusKey) : null;
            return (
              <div key={h.id} className="flex items-start gap-2.5 text-xs border-b border-nord-border/50 pb-2 last:border-0">
                <History size={13} className="text-nord-gray mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-white">
                    <span className="font-medium">{h.userName}</span>{" "}
                    {isCreate ? (
                      <>
                        criou <span className="text-nord-gray">&quot;{title}&quot;</span>
                      </>
                    ) : (
                      <>
                        moveu <span className="text-nord-gray">&quot;{title}&quot;</span> de{" "}
                        <span style={{ color: h.before ? STATUS_COLOR[h.before] : undefined }}>{fromLabel}</span> para{" "}
                        <span style={{ color: newStatusKey ? STATUS_COLOR[newStatusKey] : undefined }}>{toLabel}</span>
                      </>
                    )}
                  </p>
                  <p className="text-[10px] text-nord-gray mt-0.5">{format(parseISO(h.createdAt), "dd/MM/yyyy 'às' HH:mm")}</p>
                </div>
              </div>
            );
          })}
          {taskHistory.length === 0 && <p className="text-sm text-nord-gray text-center py-6">Nenhuma movimentação registrada ainda.</p>}
        </div>
      </Section>

      <TaskModal
        open={showModal}
        onClose={() => setShowModal(false)}
        onSaved={() => {
          setShowModal(false);
          refresh();
        }}
        task={editingTask}
        teamMembers={teamMembers}
        campaigns={campaigns}
      />
    </div>
  );
}

function KanbanColumn({
  columnKey,
  label,
  icon,
  color,
  tasks,
  onOpen,
}: {
  columnKey: string;
  label: string;
  icon: string;
  color: string;
  tasks: TaskDTO[];
  onOpen: (t: TaskDTO) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: columnKey });
  return (
    <div
      ref={setNodeRef}
      className={`w-64 shrink-0 rounded-xl border p-2 ${isOver ? "border-nord-blue bg-nord-blue/5" : "border-nord-border bg-nord-panel/40"}`}
    >
      <div className="flex items-center gap-1.5 px-1 py-1.5 mb-1">
        <DynamicIcon name={icon} size={13} style={{ color }} />
        <span className="text-xs font-medium text-white">{label}</span>
        <span className="text-[10px] text-nord-gray ml-auto">{tasks.length}</span>
      </div>
      <div className="space-y-2 min-h-[40px]">
        {tasks.map((t) => (
          <DraggableCard key={t.id} task={t} onOpen={onOpen} />
        ))}
      </div>
    </div>
  );
}

function DraggableCard({ task, onOpen }: { task: TaskDTO; onOpen: (t: TaskDTO) => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: task.id });
  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, opacity: isDragging ? 0.4 : 1 }
    : undefined;
  return (
    <div ref={setNodeRef} style={style} {...listeners} {...attributes}>
      <TaskCard task={task} onOpen={onOpen} />
    </div>
  );
}

function TaskCard({ task, onOpen, dragging }: { task: TaskDTO; onOpen: (t: TaskDTO) => void; dragging?: boolean }) {
  const progress = checklistProgress(task.checklist);
  return (
    <button
      onClick={() => onOpen(task)}
      className={`w-full text-left nord-card p-2.5 hover:border-nord-blue/50 ${dragging ? "shadow-2xl" : ""}`}
    >
      <p className="text-white text-xs font-medium leading-snug mb-1.5">{task.title}</p>
      <div className="flex items-center gap-1.5 flex-wrap mb-1.5">
        {task.category && <Badge>{task.category}</Badge>}
        {task.socialNetwork && <Badge tone="info">{task.socialNetwork}</Badge>}
        <span className="text-[10px] font-medium" style={{ color: PRIORITY_COLOR[task.priority] }}>
          {PRIORITY_LABEL[task.priority]}
        </span>
      </div>
      {progress > 0 && <ProgressBar percent={progress} />}
      <div className="flex items-center justify-between mt-1.5">
        <span className="text-[10px] text-nord-gray">{task.date ? format(parseISO(task.date), "dd/MM") : "—"}</span>
        <span className="text-[10px] text-nord-gray truncate max-w-[100px]">{task.responsavel?.name ?? ""}</span>
      </div>
    </button>
  );
}
