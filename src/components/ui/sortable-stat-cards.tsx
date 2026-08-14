"use client";

import { useEffect, useState } from "react";
import { GripVertical } from "lucide-react";
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
  rectSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { StatCard } from "./stat-card";

export type SortableStatCardConfig = {
  key: string;
  label: string;
  value: string;
  icon?: string;
  delta?: number | null;
  color?: string;
  hint?: string;
};

function SortableCard({ id, children }: { id: string; children: React.ReactNode }) {
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

/**
 * Renders a grid of StatCards the user can drag into any order; the chosen
 * order is saved to localStorage under `storageKey` and restored on future
 * visits. Pass a stable, page-unique storageKey.
 */
export function SortableStatCards({
  storageKey,
  cards,
  className = "grid grid-cols-2 md:grid-cols-4 gap-4",
}: {
  storageKey: string;
  cards: SortableStatCardConfig[];
  className?: string;
}) {
  const defaultOrder = cards.map((c) => c.key);
  const [order, setOrder] = useState<string[]>(defaultOrder);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  useEffect(() => {
    const saved = localStorage.getItem(storageKey);
    if (!saved) return;
    try {
      const parsed = JSON.parse(saved) as string[];
      if (Array.isArray(parsed) && defaultOrder.every((k) => parsed.includes(k)) && parsed.length === defaultOrder.length) {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- restores the user's saved card order on mount
        setOrder(parsed);
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    } catch {
      // ignore malformed storage
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    setOrder((prev) => {
      const oldIndex = prev.indexOf(String(active.id));
      const newIndex = prev.indexOf(String(over.id));
      const next = arrayMove(prev, oldIndex, newIndex);
      localStorage.setItem(storageKey, JSON.stringify(next));
      return next;
    });
  }

  const byKey = new Map(cards.map((c) => [c.key, c]));
  const orderedKeys = order.filter((k) => byKey.has(k));
  for (const c of cards) if (!orderedKeys.includes(c.key)) orderedKeys.push(c.key);

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={orderedKeys} strategy={rectSortingStrategy}>
        <div className={className}>
          {orderedKeys.map((key) => {
            const card = byKey.get(key);
            if (!card) return null;
            return (
              <SortableCard key={key} id={key}>
                <StatCard
                  label={card.label}
                  value={card.value}
                  icon={card.icon}
                  delta={card.delta}
                  color={card.color}
                  hint={card.hint}
                />
              </SortableCard>
            );
          })}
        </div>
      </SortableContext>
    </DndContext>
  );
}
