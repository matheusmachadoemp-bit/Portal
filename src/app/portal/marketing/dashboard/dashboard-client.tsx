"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, ChevronLeft, ChevronRight, ArrowRight, CheckCircle2, GripVertical } from "lucide-react";
import {
  DndContext,
  DragEndEvent,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Badge, StatCard } from "@/components/ui/stat-card";
import { DynamicIcon } from "@/components/dynamic-icon";
import { TaskModal } from "../task-modal";
import { STATUS_COLOR, STATUS_LABEL } from "@/lib/marketing";
import type { TaskDTO, TeamMember } from "../marketing-types";
import { startOfWeek, addDays, format, isToday, isTomorrow, isSameDay, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

type FileDTO = { id: string; name: string; category: string; fileUrl: string; createdAt: string };
type LogDTO = { id: string; action: string; entityType: string; after: string | null; createdAt: string; user: { name: string } | null };

const DONE_STATUSES = ["PUBLICADO", "RESULTADOS"];
const PRODUCING_STATUSES = ["A_PRODUZIR", "EM_PRODUCAO", "EM_EDICAO"];

const KPI_ORDER_STORAGE_KEY = "marketing-kpi-order";
const DEFAULT_KPI_ORDER = ["done", "producing", "analysis", "campaigns"];

function SortableKpiCard({ id, children }: { id: string; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  return (
    <div ref={setNodeRef} style={style} className="relative group">
      <button
        {...attributes}
        {...listeners}
        className="absolute top-2 right-2 z-10 text-nord-gray/0 group-hover:text-nord-gray/60 hover:!text-white cursor-grab active:cursor-grabbing transition-colors"
        aria-label="Reordenar card"
      >
        <GripVertical size={14} />
      </button>
      {children}
    </div>
  );
}

export function DashboardClient({
  weekTasks,
  allTasks,
  activeCampaigns,
  recentFiles,
  recentLogs,
  teamMembers,
  canCreate,
}: {
  weekTasks: TaskDTO[];
  allTasks: TaskDTO[];
  activeCampaigns: number;
  recentFiles: FileDTO[];
  recentLogs: LogDTO[];
  teamMembers: TeamMember[];
  canCreate: boolean;
}) {
  const router = useRouter();
  const [weekOffset, setWeekOffset] = useState(0);
  const [panelFilter, setPanelFilter] = useState<"TODAS" | "FEITAS" | "A_PRODUZIR" | "EM_ANALISE">("TODAS");
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [editingTask, setEditingTask] = useState<TaskDTO | null>(null);
  const [kpiOrder, setKpiOrder] = useState<string[]>(DEFAULT_KPI_ORDER);
  const kpiSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  useEffect(() => {
    const saved = localStorage.getItem(KPI_ORDER_STORAGE_KEY);
    if (!saved) return;
    try {
      const parsed = JSON.parse(saved) as string[];
      if (Array.isArray(parsed) && DEFAULT_KPI_ORDER.every((k) => parsed.includes(k))) {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- restores the user's saved card order on mount
        setKpiOrder(parsed);
      }
    } catch {
      // ignore malformed storage
    }
  }, []);

  function handleKpiDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    setKpiOrder((prev) => {
      const oldIndex = prev.indexOf(String(active.id));
      const newIndex = prev.indexOf(String(over.id));
      const next = arrayMove(prev, oldIndex, newIndex);
      localStorage.setItem(KPI_ORDER_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }

  const doneCount = allTasks.filter((t) => DONE_STATUSES.includes(t.status)).length;
  const producingCount = allTasks.filter((t) => PRODUCING_STATUSES.includes(t.status)).length;
  const analysisCount = allTasks.filter((t) => t.status === "EM_ANALISE").length;

  const kpiCards: Record<string, { label: string; value: string; color: string; icon: string }> = {
    done: { label: "Tarefas Concluídas", value: String(doneCount), color: "#22c55e", icon: "CheckCircle2" },
    producing: { label: "A Produzir", value: String(producingCount), color: "#eab308", icon: "Clock" },
    analysis: { label: "Em Análise", value: String(analysisCount), color: "#a855f7", icon: "Eye" },
    campaigns: { label: "Campanhas Ativas", value: String(activeCampaigns), color: "#3b82f6", icon: "Megaphone" },
  };

  const weekStart = addDays(startOfWeek(new Date(), { weekStartsOn: 1 }), weekOffset * 7);
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const tasksByDay = useMemo(() => {
    const map = new Map<string, TaskDTO[]>();
    for (const t of weekTasks) {
      if (!t.date) continue;
      const key = t.date.slice(0, 10);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(t);
    }
    return map;
  }, [weekTasks]);

  const panelTasks = useMemo(() => {
    let list = allTasks;
    if (panelFilter === "FEITAS") list = list.filter((t) => DONE_STATUSES.includes(t.status));
    else if (panelFilter === "A_PRODUZIR") list = list.filter((t) => PRODUCING_STATUSES.includes(t.status));
    else if (panelFilter === "EM_ANALISE") list = list.filter((t) => t.status === "EM_ANALISE");
    return list.filter((t) => t.date).slice(0, 12);
  }, [allTasks, panelFilter]);

  const todayTasks = panelTasks.filter((t) => t.date && isToday(parseISO(t.date)));
  const tomorrowTasks = panelTasks.filter((t) => t.date && isTomorrow(parseISO(t.date)));

  async function markDone(task: TaskDTO) {
    await fetch(`/api/marketing/tasks/${task.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "PUBLICADO" }),
    });
    router.refresh();
  }

  const filesByCategory = useMemo(() => {
    const map = new Map<string, FileDTO[]>();
    for (const f of recentFiles) {
      if (!map.has(f.category)) map.set(f.category, []);
      map.get(f.category)!.push(f);
    }
    return map;
  }, [recentFiles]);

  return (
    <div className="space-y-6">
      {canCreate && (
        <div className="flex justify-end">
          <button
            onClick={() => {
              setEditingTask(null);
              setShowTaskModal(true);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-nord-blue hover:bg-nord-blue-light text-white font-medium"
          >
            <Plus size={13} /> Novo conteúdo/tarefa
          </button>
        </div>
      )}

      <DndContext sensors={kpiSensors} collisionDetection={closestCenter} onDragEnd={handleKpiDragEnd}>
        <SortableContext items={kpiOrder} strategy={horizontalListSortingStrategy}>
          <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-[repeat(4,minmax(0,220px))] gap-4">
            {kpiOrder.map((key) => {
              const card = kpiCards[key];
              if (!card) return null;
              return (
                <SortableKpiCard key={key} id={key}>
                  <StatCard label={card.label} value={card.value} color={card.color} icon={card.icon} />
                </SortableKpiCard>
              );
            })}
          </div>
        </SortableContext>
      </DndContext>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 nord-card p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-white font-medium text-sm">Calendário de Conteúdo</h3>
            <div className="flex items-center gap-2">
              <button onClick={() => setWeekOffset((w) => w - 1)} className="text-nord-gray hover:text-white">
                <ChevronLeft size={16} />
              </button>
              <span className="text-xs text-nord-gray whitespace-nowrap">
                {format(days[0], "dd MMM", { locale: ptBR })} – {format(days[6], "dd MMM", { locale: ptBR })}
              </span>
              <button onClick={() => setWeekOffset((w) => w + 1)} className="text-nord-gray hover:text-white">
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
          <div className="grid grid-cols-7 gap-2">
            {days.map((day) => {
              const key = format(day, "yyyy-MM-dd");
              const items = tasksByDay.get(key) ?? [];
              return (
                <div key={key} className={`rounded-lg border p-2 min-h-[140px] ${isSameDay(day, new Date()) ? "border-nord-blue bg-nord-blue/5" : "border-nord-border"}`}>
                  <p className="text-sm text-white font-medium mb-1 capitalize">{format(day, "EEE dd", { locale: ptBR })}</p>
                  <div className="space-y-1.5">
                    {items.map((t) => (
                      <button
                        key={t.id}
                        onClick={() => {
                          setEditingTask(t);
                          setShowTaskModal(true);
                        }}
                        className="w-full text-left rounded px-2 py-1.5 text-xs leading-snug"
                        style={{ backgroundColor: `${STATUS_COLOR[t.status] ?? "#2952E3"}22`, color: STATUS_COLOR[t.status] ?? "#fff" }}
                      >
                        {t.time && <span className="opacity-70">{t.time} </span>}
                        <span className="text-white/90">{t.title}</span>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="nord-card p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-white font-medium text-sm">Painel de Tarefas</h3>
            {canCreate && (
              <button
                onClick={() => {
                  setEditingTask(null);
                  setShowTaskModal(true);
                }}
                className="flex items-center gap-1 text-xs bg-nord-blue hover:bg-nord-blue-light text-white rounded-lg px-2.5 py-1.5"
              >
                <Plus size={12} /> Nova Tarefa
              </button>
            )}
          </div>
          <div className="flex gap-1.5 mb-3 flex-wrap">
            {[
              { key: "TODAS", label: "Todas" },
              { key: "FEITAS", label: "Feitas" },
              { key: "A_PRODUZIR", label: "A Produzir" },
              { key: "EM_ANALISE", label: "Em Análise" },
            ].map((f) => (
              <button
                key={f.key}
                onClick={() => setPanelFilter(f.key as typeof panelFilter)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-medium ${
                  panelFilter === f.key ? "bg-nord-blue text-white" : "bg-nord-panel text-nord-gray hover:text-white"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {[
            { label: "Hoje", items: todayTasks },
            { label: "Amanhã", items: tomorrowTasks },
          ].map(
            (group) =>
              group.items.length > 0 && (
                <div key={group.label} className="mb-3">
                  <p className="text-[11px] text-nord-gray mb-1.5">{group.label}</p>
                  <div className="space-y-1.5">
                    {group.items.map((t) => (
                      <div key={t.id} className="flex items-center justify-between gap-2 group">
                        <button
                          onClick={() => {
                            setEditingTask(t);
                            setShowTaskModal(true);
                          }}
                          className="flex items-center gap-2 min-w-0 flex-1 text-left"
                        >
                          {canCreate && !DONE_STATUSES.includes(t.status) ? (
                            <span
                              onClick={(e) => {
                                e.stopPropagation();
                                markDone(t);
                              }}
                              className="shrink-0 w-4 h-4 rounded-full border border-nord-border hover:border-emerald-400 cursor-pointer"
                            />
                          ) : (
                            <CheckCircle2 size={16} className="shrink-0 text-emerald-400" />
                          )}
                          <span className="min-w-0">
                            <p className="text-sm text-white truncate">{t.title}</p>
                            <p className="text-[11px] text-nord-gray">{t.empresa.name}</p>
                          </span>
                        </button>
                        <div className="flex flex-col items-end gap-1 shrink-0">
                          <Badge tone={DONE_STATUSES.includes(t.status) ? "success" : t.status === "EM_ANALISE" ? "info" : "warning"}>
                            {STATUS_LABEL[t.status] ?? t.status}
                          </Badge>
                          <span className="text-[10px] text-nord-gray">{t.date ? format(parseISO(t.date), "dd/MM") : ""}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )
          )}

          {todayTasks.length === 0 && tomorrowTasks.length === 0 && (
            <p className="text-xs text-nord-gray py-4 text-center">Nenhuma tarefa para hoje ou amanhã.</p>
          )}

          <a href="/portal/marketing/tarefas" className="flex items-center gap-1 text-xs text-nord-blue-light hover:text-white mt-2">
            Ver todas as tarefas <ArrowRight size={12} />
          </a>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 nord-card p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-white font-medium text-sm">Biblioteca de Arquivos</h3>
            <a href="/portal/marketing/biblioteca" className="text-xs text-nord-blue-light hover:text-white">Ver tudo</a>
          </div>
          {filesByCategory.size === 0 ? (
            <p className="text-xs text-nord-gray py-6 text-center">Nenhum arquivo enviado ainda.</p>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {recentFiles.map((f) => (
                <a
                  key={f.id}
                  href={f.fileUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="nord-card p-2 flex flex-col gap-1 hover:border-nord-blue/50"
                >
                  {/\.(png|jpe?g|webp|gif)$/i.test(f.fileUrl) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={f.fileUrl} alt={f.name} className="w-full h-16 object-cover rounded" />
                  ) : (
                    <div className="w-full h-16 rounded bg-nord-panel flex items-center justify-center">
                      <DynamicIcon name="File" size={20} className="text-nord-gray" />
                    </div>
                  )}
                  <p className="text-[11px] text-white truncate">{f.name}</p>
                  <p className="text-[10px] text-nord-gray">{f.category}</p>
                </a>
              ))}
            </div>
          )}
        </div>

        <div className="nord-card p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-white font-medium text-sm">Resumo de Atividades</h3>
          </div>
          {recentLogs.length === 0 ? (
            <p className="text-xs text-nord-gray py-6 text-center">Nenhuma atividade recente.</p>
          ) : (
            <div className="space-y-3">
              {recentLogs.map((l) => (
                <div key={l.id} className="flex items-start gap-2">
                  <div className="w-6 h-6 rounded-full bg-nord-blue/15 flex items-center justify-center shrink-0 mt-0.5">
                    <DynamicIcon name={l.action === "UPLOAD" ? "Upload" : l.action === "STATUS_CHANGE" ? "Move" : "Plus"} size={12} className="text-nord-blue-light" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-white leading-snug">
                      <span className="font-medium">{l.user?.name ?? "Sistema"}</span>{" "}
                      {l.action === "CREATE" ? "criou" : l.action === "UPLOAD" ? "enviou o arquivo" : "atualizou"}{" "}
                      &quot;{l.after ?? l.entityType}&quot;
                    </p>
                    <p className="text-[10px] text-nord-gray">{format(parseISO(l.createdAt), "dd/MM HH:mm")}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <TaskModal
        open={showTaskModal}
        onClose={() => setShowTaskModal(false)}
        onSaved={() => {
          setShowTaskModal(false);
          router.refresh();
        }}
        task={editingTask}
        teamMembers={teamMembers}
        campaigns={[]}
      />
    </div>
  );
}
