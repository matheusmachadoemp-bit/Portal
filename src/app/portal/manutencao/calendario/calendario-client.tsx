"use client";

import { useMemo, useState } from "react";
import { format } from "date-fns";
import { Plus, LayoutGrid, List as ListIcon } from "lucide-react";
import { Section, Badge } from "@/components/ui/stat-card";
import { describePreventivaOcorrenciaLabel } from "@/lib/manutencao";
import { PreventivaFormModal } from "../preventiva-form-modal";
import { ManutencaoRegistroModal } from "../manutencao-registro-modal";
import type { PreventivaOcorrenciaDTO } from "../types";

type EquipamentoOption = { id: string; nome: string; codigo: string };
type UserOption = { id: string; name: string };
type PrestadorOption = { id: string; nome: string };

type GroupKey = "data" | "equipamento" | "loja" | "setor";

export function CalendarioClient({
  initialOcorrencias,
  equipamentos,
  teamMembers,
  prestadores,
}: {
  initialOcorrencias: PreventivaOcorrenciaDTO[];
  equipamentos: EquipamentoOption[];
  teamMembers: UserOption[];
  prestadores: PrestadorOption[];
}) {
  const [ocorrencias, setOcorrencias] = useState(initialOcorrencias);
  const [view, setView] = useState<"lista" | "mes">("lista");
  const [groupBy, setGroupBy] = useState<GroupKey>("data");
  const [setorFilter, setSetorFilter] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [showRegistroFor, setShowRegistroFor] = useState<PreventivaOcorrenciaDTO | null>(null);
  const [reagendarFor, setReagendarFor] = useState<string | null>(null);
  const [reagendarData, setReagendarData] = useState("");
  const [reagendarMotivo, setReagendarMotivo] = useState("");
  const [saving, setSaving] = useState(false);
  const [monthCursor, setMonthCursor] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  async function refresh() {
    const res = await fetch("/api/manutencao/preventivas/ocorrencias");
    const data = await res.json();
    setOcorrencias(data.ocorrencias ?? []);
  }

  const setores = useMemo(() => [...new Set(ocorrencias.map((o) => o.preventiva.equipamento.setor))], [ocorrencias]);

  const filtered = useMemo(
    () => ocorrencias.filter((o) => !setorFilter || o.preventiva.equipamento.setor === setorFilter),
    [ocorrencias, setorFilter]
  );

  const grouped = useMemo(() => {
    const groups = new Map<string, PreventivaOcorrenciaDTO[]>();
    for (const o of filtered) {
      const key =
        groupBy === "data"
          ? format(new Date(o.dataProgramada), "dd/MM/yyyy")
          : groupBy === "equipamento"
            ? `${o.preventiva.equipamento.nome} (${o.preventiva.equipamento.codigo})`
            : groupBy === "loja"
              ? o.preventiva.equipamento.empresa.name
              : o.preventiva.equipamento.setor;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(o);
    }
    return [...groups.entries()];
  }, [filtered, groupBy]);

  const monthDays = useMemo(() => {
    const start = new Date(monthCursor.getFullYear(), monthCursor.getMonth(), 1);
    const end = new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 0);
    const days: Date[] = [];
    for (let d = 1; d <= end.getDate(); d++) days.push(new Date(monthCursor.getFullYear(), monthCursor.getMonth(), d));
    const leadingBlanks = start.getDay();
    return { days, leadingBlanks };
  }, [monthCursor]);

  function ocorrenciasNoDia(day: Date) {
    return filtered.filter((o) => {
      const d = new Date(o.dataProgramada);
      return d.getFullYear() === day.getFullYear() && d.getMonth() === day.getMonth() && d.getDate() === day.getDate();
    });
  }

  async function updateStatus(id: string, status: string) {
    setSaving(true);
    try {
      await fetch(`/api/manutencao/preventivas/ocorrencias/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      await refresh();
    } finally {
      setSaving(false);
    }
  }

  async function confirmReagendar(id: string) {
    if (!reagendarData || !reagendarMotivo.trim()) return;
    setSaving(true);
    try {
      await fetch(`/api/manutencao/preventivas/ocorrencias/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "REAGENDADA", novaData: reagendarData, motivoReagendamento: reagendarMotivo }),
      });
      setReagendarFor(null);
      setReagendarData("");
      setReagendarMotivo("");
      await refresh();
    } finally {
      setSaving(false);
    }
  }

  function renderOcorrenciaRow(o: PreventivaOcorrenciaDTO) {
    const derived = describePreventivaOcorrenciaLabel(o.status, o.dataProgramada);
    return (
      <div key={o.id} className="border-b border-nord-border/50 py-2.5 last:border-0">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <p className="text-white text-sm font-medium">
              {o.preventiva.equipamento.nome} <span className="text-nord-gray font-mono text-xs">({o.preventiva.equipamento.codigo})</span>
            </p>
            <p className="text-xs text-nord-gray">
              {o.preventiva.tipoServico} · {o.preventiva.equipamento.empresa.name} · {o.preventiva.equipamento.setor} ·{" "}
              {format(new Date(o.dataProgramada), "dd/MM/yyyy")}
              {o.preventiva.horario ? ` às ${o.preventiva.horario}` : ""}
            </p>
          </div>
          <Badge tone={derived.tone}>{derived.label}</Badge>
        </div>
        {o.status === "PROGRAMADA" && (
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <button className="text-xs px-2.5 py-1 rounded-lg bg-nord-blue/15 text-nord-blue-light hover:bg-nord-blue/25" onClick={() => updateStatus(o.id, "EM_EXECUCAO")} disabled={saving}>
              Iniciar
            </button>
            <button className="text-xs px-2.5 py-1 rounded-lg bg-nord-success/15 text-nord-success hover:bg-nord-success/25" onClick={() => setShowRegistroFor(o)} disabled={saving}>
              Concluir
            </button>
            <button
              className="text-xs px-2.5 py-1 rounded-lg bg-nord-warning/15 text-nord-warning hover:bg-nord-warning/25"
              onClick={() => setReagendarFor(reagendarFor === o.id ? null : o.id)}
              disabled={saving}
            >
              Reagendar
            </button>
            <button className="text-xs px-2.5 py-1 rounded-lg bg-nord-danger/15 text-nord-danger hover:bg-nord-danger/25" onClick={() => updateStatus(o.id, "CANCELADA")} disabled={saving}>
              Cancelar
            </button>
          </div>
        )}
        {o.status === "EM_EXECUCAO" && (
          <div className="mt-2">
            <button className="text-xs px-2.5 py-1 rounded-lg bg-nord-success/15 text-nord-success hover:bg-nord-success/25" onClick={() => setShowRegistroFor(o)} disabled={saving}>
              Concluir
            </button>
          </div>
        )}
        {reagendarFor === o.id && (
          <div className="flex items-center gap-2 mt-2">
            <input type="date" className="input text-xs py-1" value={reagendarData} onChange={(e) => setReagendarData(e.target.value)} />
            <input className="input text-xs py-1 flex-1" placeholder="Motivo do reagendamento" value={reagendarMotivo} onChange={(e) => setReagendarMotivo(e.target.value)} />
            <button className="btn-primary text-xs py-1" onClick={() => confirmReagendar(o.id)} disabled={saving || !reagendarData || !reagendarMotivo.trim()}>
              Confirmar
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <Section
      title="Calendário preventivo"
      action={
        <div className="flex items-center gap-2">
          <select className="input text-xs py-1" value={setorFilter} onChange={(e) => setSetorFilter(e.target.value)}>
            <option value="">Todos os setores</option>
            {setores.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          {view === "lista" && (
            <select className="input text-xs py-1" value={groupBy} onChange={(e) => setGroupBy(e.target.value as GroupKey)}>
              <option value="data">Agrupar por data</option>
              <option value="equipamento">Agrupar por equipamento</option>
              <option value="loja">Agrupar por loja</option>
              <option value="setor">Agrupar por setor</option>
            </select>
          )}
          <div className="flex rounded-lg border border-nord-border overflow-hidden">
            <button onClick={() => setView("mes")} className={`p-1.5 ${view === "mes" ? "bg-nord-blue text-white" : "text-nord-gray hover:text-white"}`}>
              <LayoutGrid size={14} />
            </button>
            <button onClick={() => setView("lista")} className={`p-1.5 ${view === "lista" ? "bg-nord-blue text-white" : "text-nord-gray hover:text-white"}`}>
              <ListIcon size={14} />
            </button>
          </div>
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-nord-blue hover:bg-nord-blue-light text-white font-medium"
          >
            <Plus size={13} /> Programar preventiva
          </button>
        </div>
      }
    >
      {view === "lista" ? (
        <div className="space-y-5">
          {grouped.map(([key, items]) => (
            <div key={key}>
              <h4 className="text-white text-sm font-medium mb-1">{key}</h4>
              {items.map(renderOcorrenciaRow)}
            </div>
          ))}
          {grouped.length === 0 && <p className="text-sm text-nord-gray text-center py-6">Nenhuma manutenção preventiva programada.</p>}
        </div>
      ) : (
        <div>
          <div className="flex items-center justify-between mb-3">
            <button className="btn-outline text-xs" onClick={() => setMonthCursor(new Date(monthCursor.getFullYear(), monthCursor.getMonth() - 1, 1))}>
              ← Anterior
            </button>
            <span className="text-white text-sm font-medium">{format(monthCursor, "MMMM 'de' yyyy")}</span>
            <button className="btn-outline text-xs" onClick={() => setMonthCursor(new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 1))}>
              Próximo →
            </button>
          </div>
          <div className="grid grid-cols-7 gap-1.5 text-center text-[10px] text-nord-gray mb-1">
            {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((d) => (
              <span key={d}>{d}</span>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1.5">
            {Array.from({ length: monthDays.leadingBlanks }).map((_, i) => (
              <div key={`blank-${i}`} />
            ))}
            {monthDays.days.map((day) => {
              const items = ocorrenciasNoDia(day);
              return (
                <div key={day.toISOString()} className="min-h-[70px] rounded-lg border border-nord-border p-1.5 bg-nord-panel/40">
                  <span className="text-[11px] text-nord-gray">{day.getDate()}</span>
                  <div className="space-y-0.5 mt-0.5">
                    {items.slice(0, 3).map((o) => {
                      const derived = describePreventivaOcorrenciaLabel(o.status, o.dataProgramada);
                      return (
                        <div key={o.id} className="text-[9px] px-1 py-0.5 rounded truncate" style={{ backgroundColor: "#2952E322", color: "#3b82f6" }} title={o.preventiva.equipamento.nome}>
                          {o.preventiva.equipamento.nome}
                        </div>
                      );
                    })}
                    {items.length > 3 && <span className="text-[9px] text-nord-gray">+{items.length - 3}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <PreventivaFormModal
        open={showForm}
        onClose={() => setShowForm(false)}
        equipamentos={equipamentos}
        teamMembers={teamMembers}
        prestadores={prestadores}
        onSaved={() => {
          setShowForm(false);
          refresh();
        }}
      />

      {showRegistroFor && (
        <ManutencaoRegistroModal
          open={!!showRegistroFor}
          onClose={() => setShowRegistroFor(null)}
          equipamentoId={showRegistroFor.preventiva.equipamentoId}
          preventivaOcorrenciaId={showRegistroFor.id}
          onSaved={() => {
            setShowRegistroFor(null);
            refresh();
          }}
        />
      )}
    </Section>
  );
}
