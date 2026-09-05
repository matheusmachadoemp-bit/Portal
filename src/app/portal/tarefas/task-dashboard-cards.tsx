"use client";

import { useMemo } from "react";
import { Badge } from "@/components/ui/stat-card";
import { SortableStatCards } from "@/components/ui/sortable-stat-cards";
import { TASK_PRIORITY_LABEL, TASK_PRIORITY_COLOR } from "@/lib/tarefas";
import type { TaskDTO } from "./types";

function CircularRate({ percent }: { percent: number }) {
  const size = 72;
  const stroke = 7;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, percent));
  const offset = c - (clamped / 100) * c;
  return (
    <svg width={size} height={size} className="shrink-0">
      <circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(255,255,255,0.08)" strokeWidth={stroke} fill="none" />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        stroke="#22c55e"
        strokeWidth={stroke}
        fill="none"
        strokeDasharray={c}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text x="50%" y="50%" textAnchor="middle" dominantBaseline="central" className="fill-white text-sm font-semibold">
        {Math.round(clamped)}%
      </text>
    </svg>
  );
}

export function TaskDashboardCards({ tasks }: { tasks: TaskDTO[] }) {
  const stats = useMemo(() => {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd = new Date(todayStart.getTime() + 86400000);

    const hoje = tasks.filter((t) => t.dueDate && new Date(t.dueDate) >= todayStart && new Date(t.dueDate) < todayEnd);
    const concluidas = tasks.filter((t) => t.status === "CONCLUIDA");
    const emAndamento = tasks.filter((t) => t.status === "EM_ANDAMENTO");
    const atrasadas = tasks.filter((t) => t.overdue);
    const taxa = tasks.length > 0 ? (concluidas.length / tasks.length) * 100 : 0;

    const proximosVencimentos = tasks
      .filter((t) => t.dueDate && t.status !== "CONCLUIDA")
      .sort((a, b) => new Date(a.dueDate!).getTime() - new Date(b.dueDate!).getTime())
      .slice(0, 5);

    return { hoje, concluidas, emAndamento, atrasadas, taxa, proximosVencimentos };
  }, [tasks]);

  return (
    <div className="space-y-4">
      <SortableStatCards
        storageKey="tarefas-dashboard-kpi-order"
        className="grid grid-cols-2 md:grid-cols-4 gap-3"
        cards={[
          { key: "tarefas-hoje", label: "Tarefas hoje", value: String(stats.hoje.length), icon: "CalendarClock", color: "#2952E3" },
          {
            key: "concluidas",
            label: "Concluídas",
            value: String(stats.concluidas.length),
            icon: "CheckCircle2",
            color: "#22c55e",
            hint: `${tasks.length ? Math.round((stats.concluidas.length / tasks.length) * 100) : 0}% do total`,
          },
          { key: "em-andamento", label: "Em andamento", value: String(stats.emAndamento.length), icon: "Clock", color: "#eab308" },
          { key: "atrasadas", label: "Atrasadas", value: String(stats.atrasadas.length), icon: "AlertTriangle", color: "#ef4444" },
        ]}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <div className="nord-card p-4 flex items-center gap-4">
          <CircularRate percent={stats.taxa} />
          <div>
            <p className="text-sm text-white font-medium">Taxa de conclusão</p>
            <p className="text-xs text-nord-gray">
              {stats.concluidas.length} de {tasks.length} tarefas concluídas
            </p>
          </div>
        </div>

        <div className="nord-card p-4 lg:col-span-2">
          <p className="text-sm text-white font-medium mb-3">Próximos vencimentos</p>
          {stats.proximosVencimentos.length === 0 ? (
            <p className="text-xs text-nord-gray">Nenhuma tarefa com prazo em aberto.</p>
          ) : (
            <ul className="space-y-2">
              {stats.proximosVencimentos.map((t) => (
                <li key={t.id} className="flex items-center justify-between text-xs">
                  <span className="text-white truncate max-w-[60%]">{t.title}</span>
                  <span className="text-nord-gray">
                    {new Date(t.dueDate!).toLocaleDateString("pt-BR")}
                    {t.dueTime ? ` ${t.dueTime}` : ""}
                  </span>
                  <Badge tone={t.priority === "URGENTE" || t.priority === "ALTA" ? "danger" : "default"}>
                    <span style={{ color: TASK_PRIORITY_COLOR[t.priority] }}>{TASK_PRIORITY_LABEL[t.priority]}</span>
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
