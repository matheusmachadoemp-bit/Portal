"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { TaskModal } from "../task-modal";
import { Modal } from "@/components/ui/modal";
import { STATUS_COLOR, STATUS_LABEL } from "@/lib/marketing";
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
  canCreate,
  canDelete,
}: {
  initialTasks: TaskDTO[];
  teamMembers: TeamMember[];
  canCreate: boolean;
  canDelete: boolean;
}) {
  const router = useRouter();
  const [view, setView] = useState<View>("mes");
  const [cursor, setCursor] = useState(new Date());
  const [showModal, setShowModal] = useState(false);
  const [editingTask, setEditingTask] = useState<TaskDTO | null>(null);
  const [defaultDate, setDefaultDate] = useState<string | undefined>(undefined);
  // Painel "ver tudo do dia" — usado só na lista compacta de celular (Mês e
  // Semana), quando o dia já tem conteúdo agendado e não dá pra mostrar o
  // título completo de cada item numa linha estreita.
  const [detailDate, setDetailDate] = useState<Date | null>(null);

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
    setDetailDate(null);
    setEditingTask(t);
    setDefaultDate(undefined);
    setShowModal(true);
  }

  function openNew(date?: Date) {
    setDetailDate(null);
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

  const detailTasks = detailDate
    ? (tasksByDay.get(format(detailDate, "yyyy-MM-dd")) ?? []).sort((a, b) => (a.time ?? "").localeCompare(b.time ?? ""))
    : [];

  return (
    <div className="space-y-6">
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
        <>
          {/* Tablet/desktop: grade mensal de 7 colunas, com os itens de cada
              dia visíveis direto na célula. */}
          <div className="hidden md:block nord-card p-3">
            <div className="grid grid-cols-7 gap-1 mb-1">
              {["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"].map((d) => (
                <div key={d} className="text-center text-sm font-medium text-white py-1.5">{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1.5">
              {monthDays.map((day) => {
                const key = format(day, "yyyy-MM-dd");
                const items = tasksByDay.get(key) ?? [];
                const inMonth = isSameMonth(day, cursor);
                return (
                  <div
                    key={key}
                    onClick={() => canCreate && openNew(day)}
                    className={`rounded-lg border min-h-[130px] p-2 cursor-pointer ${
                      isSameDay(day, new Date()) ? "border-nord-blue bg-nord-blue/5" : "border-nord-border/60"
                    } ${inMonth ? "" : "opacity-40"} hover:border-nord-blue/60`}
                  >
                    <p className="text-sm font-medium text-white mb-1.5">{format(day, "d")}</p>
                    <div className="space-y-1">
                      {items.slice(0, 3).map((t) => (
                        <div
                          key={t.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            openTask(t);
                          }}
                          className="rounded-lg px-2 py-1.5 text-xs leading-snug truncate"
                          style={{ backgroundColor: `${STATUS_COLOR[t.status] ?? "#2952E3"}22`, color: STATUS_COLOR[t.status] ?? "#fff" }}
                        >
                          {t.time && <span className="opacity-70">{t.time} </span>}
                          <span className="text-white/90">{t.title}</span>
                        </div>
                      ))}
                      {items.length > 3 && <p className="text-xs text-nord-gray">+{items.length - 3} mais</p>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Celular: a grade de 7 colunas fica estreita demais pra mostrar o
              conteúdo agendado com clareza — em vez disso, uma lista vertical
              com um dia por linha. Cada linha mostra só um indicador compacto
              (bolinha colorida + título do primeiro item + contador do
              restante); tocar num dia que já tem conteúdo abre um painel com
              a lista completa (sem perder o toque em dia vazio, que continua
              abrindo direto o cadastro de novo conteúdo). */}
          <div className="md:hidden space-y-1.5">
            {monthDays
              .filter((day) => isSameMonth(day, cursor))
              .map((day) => {
                const key = format(day, "yyyy-MM-dd");
                const items = tasksByDay.get(key) ?? [];
                const isToday = isSameDay(day, new Date());
                const clickable = items.length > 0 || canCreate;
                return (
                  <div
                    key={key}
                    onClick={() => {
                      if (items.length > 0) setDetailDate(day);
                      else if (canCreate) openNew(day);
                    }}
                    className={`flex items-center gap-3 rounded-lg border p-2.5 ${
                      isToday ? "border-nord-blue bg-nord-blue/5" : "border-nord-border/60"
                    } ${clickable ? "cursor-pointer hover:border-nord-blue/60" : ""}`}
                  >
                    <div className="w-11 shrink-0 text-center">
                      <p className={`text-[10px] uppercase ${isToday ? "text-nord-blue-light" : "text-nord-gray"}`}>
                        {format(day, "EEE", { locale: ptBR })}
                      </p>
                      <p className="text-lg font-semibold text-white leading-none">{format(day, "d")}</p>
                    </div>
                    <div className="flex-1 min-w-0 flex items-center gap-2">
                      {items.length === 0 ? (
                        <span className="text-xs text-nord-gray">Sem conteúdo agendado</span>
                      ) : (
                        <>
                          <span
                            className="w-2 h-2 rounded-full shrink-0"
                            style={{ backgroundColor: STATUS_COLOR[items[0].status] ?? "#2952E3" }}
                          />
                          <span className="text-xs text-white truncate">{items[0].title}</span>
                          {items.length > 1 && <span className="text-[11px] text-nord-gray shrink-0">+{items.length - 1}</span>}
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
          </div>
        </>
      )}

      {view === "semana" && (
        <>
          {/* Tablet/desktop: 7 colunas, uma por dia da semana. */}
          <div className="hidden md:grid nord-card p-3 grid-cols-7 gap-2">
            {weekDays.map((day) => {
              const key = format(day, "yyyy-MM-dd");
              const items = (tasksByDay.get(key) ?? []).sort((a, b) => (a.time ?? "").localeCompare(b.time ?? ""));
              return (
                <div key={key} className={`rounded-lg border p-2 min-h-[220px] ${isSameDay(day, new Date()) ? "border-nord-blue bg-nord-blue/5" : "border-nord-border"}`}>
                  <p className="text-sm font-medium text-white mb-2 capitalize">{format(day, "EEE dd", { locale: ptBR })}</p>
                  <div className="space-y-1.5">
                    {items.map((t) => (
                      <button
                        key={t.id}
                        onClick={() => openTask(t)}
                        className="w-full text-left rounded-lg px-2 py-1.5 text-xs leading-snug"
                        style={{ backgroundColor: `${STATUS_COLOR[t.status] ?? "#2952E3"}22`, color: STATUS_COLOR[t.status] ?? "#fff" }}
                      >
                        {t.time && <span className="opacity-70">{t.time} </span>}
                        <span className="text-white/90">{t.title}</span>
                        {t.socialNetwork && <p className="text-[11px] opacity-70">{t.socialNetwork} · {t.format}</p>}
                      </button>
                    ))}
                    {items.length === 0 && <p className="text-xs text-nord-gray">—</p>}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Celular: 7 colunas finas não cabem o texto dos itens (o conteúdo
              quebrava linha e cortava quase tudo) — em vez disso, um bloco
              cheio de largura por dia, em lista vertical, do jeito de uma
              agenda. */}
          <div className="md:hidden space-y-3">
            {weekDays.map((day) => {
              const key = format(day, "yyyy-MM-dd");
              const items = (tasksByDay.get(key) ?? []).sort((a, b) => (a.time ?? "").localeCompare(b.time ?? ""));
              return (
                <div
                  key={key}
                  className={`rounded-lg border p-3 ${isSameDay(day, new Date()) ? "border-nord-blue bg-nord-blue/5" : "border-nord-border"}`}
                >
                  <p className="text-sm font-medium text-white mb-2 capitalize">{format(day, "EEE dd", { locale: ptBR })}</p>
                  <div className="space-y-1.5">
                    {items.map((t) => (
                      <button
                        key={t.id}
                        onClick={() => openTask(t)}
                        className="w-full text-left rounded-lg px-3 py-2 text-xs leading-snug"
                        style={{ backgroundColor: `${STATUS_COLOR[t.status] ?? "#2952E3"}22`, color: STATUS_COLOR[t.status] ?? "#fff" }}
                      >
                        {t.time && <span className="opacity-70">{t.time} </span>}
                        <span className="text-white/90">{t.title}</span>
                        {t.socialNetwork && <p className="text-[11px] opacity-70 mt-0.5">{t.socialNetwork} · {t.format}</p>}
                      </button>
                    ))}
                    {items.length === 0 && <p className="text-xs text-nord-gray">Nenhum conteúdo agendado.</p>}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {view === "dia" && (
        <div className="nord-card p-4">
          {dayTasks.length === 0 ? (
            <p className="text-sm text-nord-gray text-center py-8">Nenhum conteúdo agendado para este dia.</p>
          ) : (
            <div className="space-y-3">
              {dayTasks.map((t) => (
                <button
                  key={t.id}
                  onClick={() => openTask(t)}
                  className="w-full flex items-center justify-between gap-3 text-left nord-card p-4 hover:border-nord-blue/50"
                >
                  <div className="flex items-center gap-4 min-w-0">
                    <span className="text-sm font-medium text-white w-14 shrink-0">{t.time ?? "—"}</span>
                    <div className="min-w-0">
                      <p className="text-white text-base font-medium truncate">{t.title}</p>
                      <p className="text-xs text-nord-gray mt-0.5">
                        {t.socialNetwork ?? "—"} · {t.format ?? "—"} · {t.responsavel?.name ?? "Sem responsável"} · {t.empresa.name}
                      </p>
                    </div>
                  </div>
                  <span
                    className="text-xs px-2.5 py-1 rounded-full shrink-0"
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

      {/* Painel "ver tudo do dia" — só é aberto pela lista compacta de celular
          da visão Mês, quando o dia tocado já tem conteúdo agendado. */}
      <Modal
        open={!!detailDate}
        onClose={() => setDetailDate(null)}
        title={detailDate ? format(detailDate, "dd 'de' MMMM 'de' yyyy", { locale: ptBR }) : ""}
      >
        <div className="space-y-3">
          {canCreate && detailDate && (
            <button
              onClick={() => openNew(detailDate)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-nord-blue hover:bg-nord-blue-light text-white font-medium"
            >
              <Plus size={13} /> Novo conteúdo
            </button>
          )}
          <div className="space-y-2">
            {detailTasks.length === 0 ? (
              <p className="text-sm text-nord-gray text-center py-6">Nenhum conteúdo agendado para este dia.</p>
            ) : (
              detailTasks.map((t) => (
                <button
                  key={t.id}
                  onClick={() => openTask(t)}
                  className="w-full flex items-center justify-between gap-3 text-left nord-card p-3 hover:border-nord-blue/50"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-sm font-medium text-white w-12 shrink-0">{t.time ?? "—"}</span>
                    <div className="min-w-0">
                      <p className="text-white text-sm font-medium truncate">{t.title}</p>
                      <p className="text-xs text-nord-gray mt-0.5 truncate">
                        {t.socialNetwork ?? "—"} · {t.format ?? "—"} · {t.responsavel?.name ?? "Sem responsável"}
                      </p>
                    </div>
                  </div>
                  <span
                    className="text-[11px] px-2 py-0.5 rounded-full shrink-0"
                    style={{ backgroundColor: `${STATUS_COLOR[t.status] ?? "#2952E3"}22`, color: STATUS_COLOR[t.status] ?? "#fff" }}
                  >
                    {STATUS_LABEL[t.status] ?? t.status}
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      </Modal>

      <TaskModal
        key={showModal ? (editingTask?.id ?? "novo") : "closed"}
        open={showModal}
        onClose={() => setShowModal(false)}
        onSaved={() => {
          setShowModal(false);
          router.refresh();
        }}
        onDeleted={() => {
          setShowModal(false);
          router.refresh();
        }}
        task={editingTask}
        teamMembers={teamMembers}
        defaultDate={defaultDate}
        canDelete={canDelete}
      />
    </div>
  );
}
