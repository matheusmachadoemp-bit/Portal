"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, Paperclip, MessageSquare } from "lucide-react";
import { Badge } from "@/components/ui/stat-card";
import {
  TASK_PRIORITY_LABEL,
  TASK_PRIORITY_COLOR,
  TASK_PRIORITY_ORDER,
  TASK_STATUS_LABEL,
  TASK_STATUS_TONE,
  effectiveTaskStatus,
} from "@/lib/tarefas";
import { SectorBadge } from "./sector-badge";
import { ResponsavelBadge } from "./responsavel-badge";
import type { TaskDTO } from "./types";

type SortField = "title" | "empresa" | "sectorKey" | "dueDate" | "priority" | "status";
type SortDir = "asc" | "desc";

function formatDueDate(dueDate: string | null, dueTime: string | null): string {
  if (!dueDate) return "—";
  const d = new Date(dueDate);
  const date = d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  return dueTime ? `${date} ${dueTime}` : date;
}

export function TaskTable({ tasks, onOpen }: { tasks: TaskDTO[]; onOpen: (task: TaskDTO) => void }) {
  const [sortField, setSortField] = useState<SortField>("dueDate");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  function toggleSort(field: SortField) {
    if (field === sortField) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  }

  const sorted = useMemo(() => {
    const copy = [...tasks];
    copy.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case "title":
          cmp = a.title.localeCompare(b.title);
          break;
        case "empresa":
          cmp = a.empresa.name.localeCompare(b.empresa.name);
          break;
        case "sectorKey":
          cmp = a.sectorKey.localeCompare(b.sectorKey);
          break;
        case "priority":
          cmp = TASK_PRIORITY_ORDER[a.priority] - TASK_PRIORITY_ORDER[b.priority];
          break;
        case "status":
          cmp = effectiveTaskStatus(a).localeCompare(effectiveTaskStatus(b));
          break;
        case "dueDate":
        default: {
          const at = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
          const bt = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
          cmp = at - bt;
        }
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [tasks, sortField, sortDir]);

  function SortIcon({ field }: { field: SortField }) {
    if (field !== sortField) return <ArrowUpDown size={11} className="text-nord-gray/50" />;
    return sortDir === "asc" ? <ArrowUp size={11} /> : <ArrowDown size={11} />;
  }

  function Th({ field, children }: { field: SortField; children: React.ReactNode }) {
    return (
      <th className="py-2 pr-4">
        <button onClick={() => toggleSort(field)} className="flex items-center gap-1 hover:text-white">
          {children} <SortIcon field={field} />
        </button>
      </th>
    );
  }

  if (tasks.length === 0) {
    return <p className="text-sm text-nord-gray py-8 text-center">Nenhuma tarefa encontrada com os filtros atuais.</p>;
  }

  return (
    <div className="overflow-x-auto nord-scrollbar">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-nord-gray border-b border-nord-border">
            <Th field="title">Tarefa</Th>
            <th className="py-2 pr-4">Responsável</th>
            <Th field="empresa">Unidade</Th>
            <Th field="sectorKey">Setor</Th>
            <Th field="dueDate">Prazo</Th>
            <Th field="priority">Prioridade</Th>
            <Th field="status">Status</Th>
            <th className="py-2 pr-4" />
          </tr>
        </thead>
        <tbody>
          {sorted.map((t) => {
            const status = effectiveTaskStatus(t);
            const checklistDone = t.checklist.filter((c) => c.done).length;
            return (
              <tr
                key={t.id}
                onClick={() => onOpen(t)}
                className="border-b border-nord-border/50 hover:bg-white/5 cursor-pointer"
              >
                <td className="py-2.5 pr-4 max-w-[260px]">
                  <p className="text-white truncate">{t.title}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    {t.checklist.length > 0 && (
                      <span className="text-[11px] text-nord-gray">
                        {checklistDone}/{t.checklist.length} itens
                      </span>
                    )}
                    {(t._count?.attachments ?? 0) > 0 && (
                      <span className="flex items-center gap-0.5 text-[11px] text-nord-gray">
                        <Paperclip size={10} /> {t._count!.attachments}
                      </span>
                    )}
                    {(t._count?.comments ?? 0) > 0 && (
                      <span className="flex items-center gap-0.5 text-[11px] text-nord-gray">
                        <MessageSquare size={10} /> {t._count!.comments}
                      </span>
                    )}
                  </div>
                </td>
                <td className="py-2.5 pr-4">
                  {t.assignees.length === 0 ? (
                    <span className="text-nord-gray">—</span>
                  ) : (
                    <span className="inline-flex items-center gap-1">
                      <ResponsavelBadge userId={t.assignees[0].userId} name={t.assignees[0].user.name} />
                      {t.assignees.length > 1 && (
                        <span className="text-[11px] text-nord-gray">+{t.assignees.length - 1}</span>
                      )}
                    </span>
                  )}
                </td>
                <td className="py-2.5 pr-4">
                  <span className="inline-flex items-center gap-1.5 text-nord-gray">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: t.empresa.color }} />
                    {t.empresa.name}
                  </span>
                </td>
                <td className="py-2.5 pr-4">
                  <SectorBadge sectorKey={t.sectorKey} />
                </td>
                <td className={`py-2.5 pr-4 ${t.overdue ? "text-red-400 font-medium" : "text-nord-gray"}`}>
                  {formatDueDate(t.dueDate, t.dueTime)}
                </td>
                <td className="py-2.5 pr-4">
                  <span className="inline-flex items-center gap-1 text-xs" style={{ color: TASK_PRIORITY_COLOR[t.priority] }}>
                    {TASK_PRIORITY_LABEL[t.priority]}
                  </span>
                </td>
                <td className="py-2.5 pr-4">
                  <Badge tone={TASK_STATUS_TONE[status]}>{TASK_STATUS_LABEL[status]}</Badge>
                </td>
                <td className="py-2.5 pr-4 text-right">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpen(t);
                    }}
                    className="text-xs text-nord-blue-light hover:underline"
                  >
                    Ver
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
