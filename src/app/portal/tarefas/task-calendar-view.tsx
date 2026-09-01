"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { TASK_PRIORITY_COLOR } from "@/lib/tarefas";
import type { TaskDTO } from "./types";

const WEEKDAY_HEADERS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const MONTH_LABELS = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

export function TaskCalendarView({ tasks, onOpen }: { tasks: TaskDTO[]; onOpen: (task: TaskDTO) => void }) {
  const [cursor, setCursor] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });

  const tasksByDay = useMemo(() => {
    const map = new Map<string, TaskDTO[]>();
    for (const t of tasks) {
      if (!t.dueDate) continue;
      const key = dateKey(new Date(t.dueDate));
      const list = map.get(key) ?? [];
      list.push(t);
      map.set(key, list);
    }
    return map;
  }, [tasks]);

  const cells = useMemo(() => {
    const firstOfMonth = new Date(cursor.year, cursor.month, 1);
    const startOffset = firstOfMonth.getDay();
    const gridStart = new Date(cursor.year, cursor.month, 1 - startOffset);
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i);
      return d;
    });
  }, [cursor]);

  const today = new Date();

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-white font-medium">
          {MONTH_LABELS[cursor.month]} {cursor.year}
        </p>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setCursor((c) => (c.month === 0 ? { year: c.year - 1, month: 11 } : { year: c.year, month: c.month - 1 }))}
            className="btn-outline px-2"
          >
            <ChevronLeft size={14} />
          </button>
          <button
            onClick={() => setCursor({ year: today.getFullYear(), month: today.getMonth() })}
            className="btn-outline"
          >
            Hoje
          </button>
          <button
            onClick={() => setCursor((c) => (c.month === 11 ? { year: c.year + 1, month: 0 } : { year: c.year, month: c.month + 1 }))}
            className="btn-outline px-2"
          >
            <ChevronRight size={14} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-px bg-nord-border rounded-lg overflow-hidden">
        {WEEKDAY_HEADERS.map((w) => (
          <div key={w} className="bg-nord-panel text-center text-[11px] text-nord-gray py-1.5">
            {w}
          </div>
        ))}
        {cells.map((d, i) => {
          const inMonth = d.getMonth() === cursor.month;
          const isToday = dateKey(d) === dateKey(today);
          const dayTasks = tasksByDay.get(dateKey(d)) ?? [];
          return (
            <div key={i} className={`bg-nord-card min-h-[90px] p-1.5 ${inMonth ? "" : "opacity-40"}`}>
              <p className={`text-[11px] mb-1 ${isToday ? "text-nord-blue-light font-semibold" : "text-nord-gray"}`}>{d.getDate()}</p>
              <div className="space-y-0.5">
                {dayTasks.slice(0, 3).map((t) => (
                  <button
                    key={t.id}
                    onClick={() => onOpen(t)}
                    className="w-full text-left text-[10px] px-1 py-0.5 rounded truncate bg-white/5 hover:bg-white/10 text-white"
                    style={{ borderLeft: `2px solid ${TASK_PRIORITY_COLOR[t.priority]}` }}
                  >
                    {t.title}
                  </button>
                ))}
                {dayTasks.length > 3 && <p className="text-[10px] text-nord-gray">+{dayTasks.length - 3} mais</p>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
