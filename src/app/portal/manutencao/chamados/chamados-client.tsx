"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { format, parseISO } from "date-fns";
import { Plus, LayoutGrid, List as ListIcon } from "lucide-react";
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
import { Badge } from "@/components/ui/stat-card";
import { DynamicIcon } from "@/components/dynamic-icon";
import { Toolbar } from "@/components/ui/toolbar";
import {
  CHAMADO_CATEGORIA_LABEL,
  CHAMADO_PRIORIDADE_COLOR,
  CHAMADO_PRIORIDADE_LABEL,
  CHAMADO_STATUS_LABEL,
  KANBAN_COLUMNS,
  isChamadoOverdue,
} from "@/lib/manutencao";
import { ChamadoFormModal } from "../chamado-form-modal";
import type { ChamadoDTO } from "../types";

type EquipamentoOption = { id: string; nome: string; codigo: string; fotoUrl: string | null; setor: string };
type UserOption = { id: string; name: string };

export function ChamadosClient({
  initialChamados,
  equipamentos,
  teamMembers,
  canCreate,
}: {
  initialChamados: ChamadoDTO[];
  equipamentos: EquipamentoOption[];
  teamMembers: UserOption[];
  canCreate: boolean;
}) {
  const [chamados, setChamados] = useState(initialChamados);
  const [view, setView] = useState<"kanban" | "lista">("kanban");
  const [showModal, setShowModal] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const router = useRouter();

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  async function refresh() {
    const res = await fetch("/api/manutencao/chamados");
    const data = await res.json();
    setChamados(data.chamados);
  }

  async function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    setActiveId(null);
    if (!over) return;
    const chamadoId = String(active.id);
    const newStatus = String(over.id);
    const chamado = chamados.find((c) => c.id === chamadoId);
    if (!chamado || chamado.status === newStatus) return;
    if (newStatus === "RESOLVIDO" && !chamado.descricaoSolucao) {
      router.push(`/portal/manutencao/chamados/${chamadoId}`);
      return;
    }
    setChamados((prev) => prev.map((c) => (c.id === chamadoId ? { ...c, status: newStatus } : c)));
    const res = await fetch(`/api/manutencao/chamados/${chamadoId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    if (!res.ok) refresh();
  }

  const activeChamado = chamados.find((c) => c.id === activeId);

  function openDetail(c: ChamadoDTO) {
    router.push(`/portal/manutencao/chamados/${c.id}`);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <Toolbar
          exportFilename="chamados-manutencao"
          exportSheetName="Chamados"
          exportRows={() =>
            chamados.map((c) => ({
              Protocolo: c.protocolo,
              Título: c.titulo,
              Loja: c.empresa.name,
              Setor: c.setor,
              Categoria: CHAMADO_CATEGORIA_LABEL[c.categoria] ?? c.categoria,
              Prioridade: CHAMADO_PRIORIDADE_LABEL[c.prioridade] ?? c.prioridade,
              Status: CHAMADO_STATUS_LABEL[c.status] ?? c.status,
              Responsável: c.responsavel?.name ?? "",
              Abertura: format(parseISO(c.createdAt), "dd/MM/yyyy"),
            }))
          }
          onRefresh={refresh}
        />
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
              onClick={() => setShowModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-nord-blue hover:bg-nord-blue-light text-white font-medium"
            >
              <Plus size={13} /> Relatar problema
            </button>
          )}
        </div>
      </div>

      {view === "kanban" ? (
        <DndContext sensors={sensors} onDragStart={(e: DragStartEvent) => setActiveId(String(e.active.id))} onDragEnd={handleDragEnd}>
          <div className="flex gap-3 overflow-x-auto nord-scrollbar pb-2">
            {KANBAN_COLUMNS.map((col) => (
              <KanbanColumn
                key={col.key}
                columnKey={col.key}
                label={col.label}
                icon={col.icon}
                color={col.color}
                chamados={chamados.filter((c) => c.status === col.key)}
                onOpen={openDetail}
              />
            ))}
          </div>
          <DragOverlay>{activeChamado && <ChamadoCard chamado={activeChamado} onOpen={() => {}} dragging />}</DragOverlay>
        </DndContext>
      ) : (
        <div className="nord-card overflow-x-auto nord-scrollbar">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-nord-gray border-b border-nord-border">
                <th className="py-2 px-3">Protocolo</th>
                <th className="py-2 px-3">Título</th>
                <th className="py-2 px-3">Equipamento</th>
                <th className="py-2 px-3">Setor</th>
                <th className="py-2 px-3">Prioridade</th>
                <th className="py-2 px-3">Status</th>
                <th className="py-2 px-3">Responsável</th>
                <th className="py-2 px-3">Prazo</th>
              </tr>
            </thead>
            <tbody>
              {chamados.map((c) => (
                <tr key={c.id} onClick={() => openDetail(c)} className="border-b border-nord-border/50 hover:bg-white/5 cursor-pointer">
                  <td className="py-2 px-3 text-white font-mono text-xs">{c.protocolo}</td>
                  <td className="py-2 px-3 text-white">{c.titulo}</td>
                  <td className="py-2 px-3 text-nord-gray">{c.equipamento?.nome ?? "—"}</td>
                  <td className="py-2 px-3 text-nord-gray">{c.setor}</td>
                  <td className="py-2 px-3">
                    <span className="text-[11px] font-medium" style={{ color: CHAMADO_PRIORIDADE_COLOR[c.prioridade] }}>
                      {CHAMADO_PRIORIDADE_LABEL[c.prioridade] ?? c.prioridade}
                    </span>
                  </td>
                  <td className="py-2 px-3">
                    <Badge tone={isChamadoOverdue(c) ? "danger" : "default"}>{CHAMADO_STATUS_LABEL[c.status] ?? c.status}</Badge>
                  </td>
                  <td className="py-2 px-3 text-nord-gray">{c.responsavel?.name ?? "—"}</td>
                  <td className="py-2 px-3 text-nord-gray">{c.prazo ? format(parseISO(c.prazo), "dd/MM/yyyy") : "—"}</td>
                </tr>
              ))}
              {chamados.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-nord-gray text-sm">
                    Nenhum chamado encontrado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <ChamadoFormModal
        open={showModal}
        onClose={() => setShowModal(false)}
        equipamentos={equipamentos}
        teamMembers={teamMembers}
        onCreated={() => {
          setShowModal(false);
          refresh();
        }}
      />
    </div>
  );
}

function KanbanColumn({
  columnKey,
  label,
  icon,
  color,
  chamados,
  onOpen,
}: {
  columnKey: string;
  label: string;
  icon: string;
  color: string;
  chamados: ChamadoDTO[];
  onOpen: (c: ChamadoDTO) => void;
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
        <span className="text-[10px] text-nord-gray ml-auto">{chamados.length}</span>
      </div>
      <div className="space-y-2 min-h-[40px]">
        {chamados.map((c) => (
          <DraggableCard key={c.id} chamado={c} onOpen={onOpen} />
        ))}
      </div>
    </div>
  );
}

function DraggableCard({ chamado, onOpen }: { chamado: ChamadoDTO; onOpen: (c: ChamadoDTO) => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: chamado.id });
  const style = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, opacity: isDragging ? 0.4 : 1 } : undefined;
  return (
    <div ref={setNodeRef} style={style} {...listeners} {...attributes}>
      <ChamadoCard chamado={chamado} onOpen={onOpen} />
    </div>
  );
}

function ChamadoCard({ chamado, onOpen, dragging }: { chamado: ChamadoDTO; onOpen: (c: ChamadoDTO) => void; dragging?: boolean }) {
  const overdue = isChamadoOverdue(chamado);
  return (
    <button
      onClick={() => onOpen(chamado)}
      className={`w-full text-left nord-card p-2.5 hover:border-nord-blue/50 ${dragging ? "shadow-2xl" : ""}`}
    >
      <p className="text-[10px] text-nord-gray font-mono mb-1">{chamado.protocolo}</p>
      <p className="text-white text-xs font-medium leading-snug mb-1.5">{chamado.titulo}</p>
      <div className="flex items-center gap-1.5 flex-wrap mb-1.5">
        <Badge>{CHAMADO_CATEGORIA_LABEL[chamado.categoria] ?? chamado.categoria}</Badge>
        <span className="text-[10px] font-medium" style={{ color: CHAMADO_PRIORIDADE_COLOR[chamado.prioridade] }}>
          {CHAMADO_PRIORIDADE_LABEL[chamado.prioridade]}
        </span>
      </div>
      <div className="flex items-center justify-between mt-1.5">
        <span className={`text-[10px] ${overdue ? "text-nord-danger font-medium" : "text-nord-gray"}`}>
          {chamado.prazo ? format(parseISO(chamado.prazo), "dd/MM") : "—"}
        </span>
        <span className="text-[10px] text-nord-gray truncate max-w-[100px]">{chamado.responsavel?.name ?? ""}</span>
      </div>
    </button>
  );
}
