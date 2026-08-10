"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { MarketingTabs } from "../marketing-tabs";
import { TaskModal } from "../task-modal";
import { STATUS_COLOR } from "@/lib/marketing";
import type { TaskDTO, TeamMember } from "../marketing-types";
import {
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  addDays,
  addMonths,
  addWeeks,
  format,
  isSameMonth,
  isSameDay,
} from "date-fns";
import { ptBR } from "date-fns/locale";

type View = "mes" | "semana" | "dia";

export function CalendarClient({
  initialTasks,
  teamMembers,
  campaigns,
  canCreate,
}: {
  initialTasks: TaskDTO[];
  teamMembers: TeamMember[];
  campaigns: { id: string; name: string }[];
  canCreate: boolean;
}) {
  const router = useRouter();
  const [view, setView] = useState<View>("mes");
  const [cursor, setCursor] = useState(new Date());
  const [showModal, setShowModal] = useState(false);
  const [editingTask, setEditingTask] = useState<TaskDTO | null>(null);
  const [defaultDate, setDefaultDate] = useState<string | undefined>(undefined);

  const tasksByDay = useMemo(() => {
    const map = new Map<string, TaskDTO[]>();
    for (const t of initialTasks) {
      if (!t.date) continue;
      const key = t.date.slice(0, 10);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(t);
    }
    return map;
  }, [initialTasks]);

  function openTask(t: TaskDTO) {
    setEditingTask(t);
    setDefaultDate(undefined);
    setShowModal(true);
  }

  function openNew(date?: Date) {
    setEditingTask(null);
    setDefaultDate(date ? format(date, "yyyy-MM-dd") : undefined);
    setShowModal(true);
  }

  function navigate(dir: 1 | -1) {
    if (view === "mes") setCursor((c) => addMonths(c, dir));
    else if (view === "semana") setCursor((c) => addWeeks(c, dir));
    else setCursor((c) => addDays(c, dir));
  }

  const monthStart = startOfMonth(cursor);
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const gridEnd = endOfWeek(endOfMonth(cursor), { weekStartsOn: 1 });
  const monthDays: Date[] = [];
  for (let d = gridStart; d <= gridEnd; d = addDays(d, 1)) monthDays.push(d);

  const weekStart = startOfWeek(cursor, { weekStartsOn: 1 });
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const dayKey = format(cursor, "yyyy-MM-dd");
  const dayTasks = (tasksByDay.get(dayKey) ?? []).sort((a, b) => (a.time ?? "").localeCompare(b.time ?? ""));

  return (
    <div className="space-y-6">
      <MarketingTabs />

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <button onClick={() => setCursor(new Date())} className="px-3 py-1.5 rounded-lg text-xs border border-nord-border text-nord-gray hover:text-white">
            Hoje
          </button>
          <button onClick={() => navigate(-1)} className="text-nord-gray hover:text-white">
            <ChevronLeft size={18} />
          </button>
          <button onClick={() => navigate(1)} className="text-nord-gray hover:text-white">
            <ChevronRight size={18} />
          </button>
          <span className="text-white font-medium capitalize">
            {view === "dia" ? format(cursor, "dd 'de' MMMM 'de' yyyy", { locale: ptBR }) : format(cursor, "MMMM 'de' yyyy", { locale: ptBR })}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-nord-border overflow-hidden">
            {(["mes", "semana", "dia"] as View[]).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`px-3 py-1.5 text-xs font-medium ${view === v ? "bg-nord-blue text-white" : "text-nord-gray hover:text-white"}`}
              >
                {v === "mes" ? "Mês" : v === "semana" ? "Semana" : "Dia"}
              </button>
            ))}
          </div>
          {canCreate && (
            <button
              onClick={() => openNew(cursor)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-nord-blue hover:bg-nord-blue-light text-white font-medium"
            >
              <Plus size={13} /> Novo conteúdo
            </button>
          )}
        </div>
      </div>

      {view === "mes" && (
        <div className="nord-card p-3">
          <div className="grid grid-cols-7 gap-1 mb-1">
            {["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"].map((d) => (
              <div key={d} className="text-center text-[11px] text-nord-gray py-1">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {monthDays.map((day) => {
              const key = format(day, "yyyy-MM-dd");
              const items = tasksByDay.get(key) ?? [];
              const inMonth = isSameMonth(day, cursor);
              return (
                <div
                  key={key}
                  onClick={() => canCreate && openNew(day)}
                  className={`rounded-lg border min-h-[90px] p-1.5 cursor-pointer ${
                    isSameDay(day, new Date()) ? "border-nord-blue bg-nord-blue/5" : "border-nord-border/60"
                  } ${inMonth ? "" : "opacity-40"} hover:border-nord-blue/60`}
                >
                  <p className="text-[11px] text-nord-gray mb-1">{format(day, "d")}</p>
                  <div className="space-y-0.5">
                    {items.slice(0, 3).map((t) => (
                      <div
                        key={t.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          openTask(t);
                        }}
                        className="text-[10px] rounded px-1 py-0.5 truncate"
                        style={{ backgroundColor: `${STATUS_COLOR[t.status] ?? "#2952E3"}22`, color: STATUS_COLOR[t.status] ?? "#fff" }}
                      >
                        {t.time && <span className="opacity-70">{t.time} </span>}
                        {t.title}
                      </div>
                    ))}
                    {items.length > 3 && <p className="text-[10px] text-nord-gray">+{items.length - 3} mais</p>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {view === "semana" && (
        <div className="nord-card p-3 grid grid-cols-7 gap-2">
          {weekDays.map((day) => {
            const key = format(day, "yyyy-MM-dd");
            const items = (tasksByDay.get(key) ?? []).sort((a, b) => (a.time ?? "").localeCompare(b.time ?? ""));
            return (
              <div key={key} className={`rounded-lg border p-2 min-h-[200px] ${isSameDay(day, new Date()) ? "border-nord-blue bg-nord-blue/5" : "border-nord-border"}`}>
                <p className="text-[11px] text-nord-gray mb-1.5 capitalize">{format(day, "EEE dd", { locale: ptBR })}</p>
                <div className="space-y-1">
                  {items.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => openTask(t)}
                      className="w-full text-left rounded px-1.5 py-1 text-[11px]"
                      style={{ backgroundColor: `${STATUS_COLOR[t.status] ?? "#2952E3"}22`, color: STATUS_COLOR[t.status] ?? "#fff" }}
                    >
                      {t.time && <span className="opacity-70">{t.time} </span>}
                      <span className="text-white/90">{t.title}</span>
                      {t.socialNetwork && <p className="text-[10px] opacity-70">{t.socialNetwork} · {t.format}</p>}
                    </button>
                  ))}
                  {items.length === 0 && <p className="text-[11px] text-nord-gray">—</p>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {view === "dia" && (
        <div className="nord-card p-4">
          {dayTasks.length === 0 ? (
            <p className="text-sm text-nord-gray text-center py-8">Nenhum conteúdo agendado para este dia.</p>
          ) : (
            <div className="space-y-2">
              {dayTasks.map((t) => (
                <button
                  key={t.id}
                  onClick={() => openTask(t)}
                  className="w-full flex items-center justify-between gap-3 text-left nord-card p-3 hover:border-nord-blue/50"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-xs text-nord-gray w-12 shrink-0">{t.time ?? "—"}</span>
                    <div className="min-w-0">
                      <p className="text-white text-sm truncate">{t.title}</p>
                      <p className="text-xs text-nord-gray">
                        {t.socialNetwork ?? "—"} · {t.format ?? "—"} · {t.responsavel?.name ?? "Sem responsável"} · {t.empresa.name}
                      </p>
                    </div>
                  </div>
                  <span
                    className="text-[11px] px-2 py-0.5 rounded-full shrink-0"
                    style={{ backgroundColor: `${STATUS_COLOR[t.status] ?? "#2952E3"}22`, color: STATUS_COLOR[t.status] ?? "#fff" }}
                  >
                    {t.status}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <TaskModal
        open={showModal}
        onClose={() => setShowModal(false)}
        onSaved={() => {
          setShowModal(false);
          router.refresh();
        }}
        task={editingTask}
        teamMembers={teamMembers}
        campaigns={campaigns}
        defaultDate={defaultDate}
      />
    </div>
  );
}
