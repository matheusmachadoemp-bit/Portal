"use client";

import { ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

const WEEKDAY_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
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

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/**
 * Grade de calendário mensal reutilizável (navegação Anterior/Hoje/Próximo + cabeçalho de dias
 * da semana + células de 42 dias, incluindo o rastro do mês anterior/seguinte para completar as
 * semanas). Não sabe nada sobre o que cada tela mostra dentro de cada dia — isso é responsabilidade
 * de `renderDay`, passado pelo chamador (ex.: pílulas de manutenção, tarefas, conteúdo de marketing).
 *
 * Extraído a partir do padrão já usado em `marketing/calendario/calendar-client.tsx` e
 * `tarefas/task-calendar-view.tsx`. As telas de Férias (RH) e as duas citadas acima continuam com
 * sua própria implementação por ora — a extração ficou disponível para reuso futuro, sem forçar
 * uma migração de telas que já funcionam e não fazem parte deste pedido.
 */
export function MonthCalendar({
  cursor,
  onCursorChange,
  renderDay,
  className = "",
}: {
  /** Qualquer dia dentro do mês exibido — só o ano/mês são usados. */
  cursor: Date;
  onCursorChange: (next: Date) => void;
  renderDay: (day: Date, ctx: { inMonth: boolean; isToday: boolean }) => ReactNode;
  className?: string;
}) {
  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const firstOfMonth = new Date(year, month, 1);
  const startOffset = firstOfMonth.getDay();
  const gridStart = new Date(year, month, 1 - startOffset);
  const cells = Array.from({ length: 42 }, (_, i) => new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i));
  const today = new Date();

  return (
    <div className={className}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-white text-sm font-semibold capitalize">
          {MONTH_LABELS[month]} de {year}
        </span>
        <div className="flex items-center gap-1.5">
          <button
            className="btn-outline p-1.5"
            onClick={() => onCursorChange(new Date(year, month - 1, 1))}
            aria-label="Mês anterior"
          >
            <ChevronLeft size={14} />
          </button>
          <button className="btn-outline text-xs px-2.5 py-1.5" onClick={() => onCursorChange(new Date())}>
            Hoje
          </button>
          <button
            className="btn-outline p-1.5"
            onClick={() => onCursorChange(new Date(year, month + 1, 1))}
            aria-label="Próximo mês"
          >
            <ChevronRight size={14} />
          </button>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-1 mb-1.5">
        {WEEKDAY_LABELS.map((d) => (
          <span key={d} className="text-center text-[11px] font-medium text-nord-gray py-1">
            {d}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1.5">
        {cells.map((day) => (
          <div key={day.toISOString()}>{renderDay(day, { inMonth: day.getMonth() === month, isToday: isSameDay(day, today) })}</div>
        ))}
      </div>
    </div>
  );
}
