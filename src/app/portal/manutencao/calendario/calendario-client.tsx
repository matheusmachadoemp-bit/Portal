"use client";

import { useMemo, useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Plus, LayoutGrid, List as ListIcon, History } from "lucide-react";
import { Section, Badge } from "@/components/ui/stat-card";
import { SortableStatCards } from "@/components/ui/sortable-stat-cards";
import { Modal } from "@/components/ui/modal";
import { MonthCalendar } from "@/components/ui/month-calendar";
import { formatNumber } from "@/lib/calc";
import { describePreventivaOcorrenciaLabel } from "@/lib/manutencao";
import { PreventivaFormModal } from "../preventiva-form-modal";
import { ManutencaoRegistroModal } from "../manutencao-registro-modal";
import type { PreventivaOcorrenciaDTO } from "../types";

type EquipamentoOption = { id: string; nome: string; codigo: string };
type UserOption = { id: string; name: string };
type PrestadorOption = { id: string; nome: string };

type GroupKey = "data" | "equipamento" | "loja" | "setor";

/** Cor sólida por tom de urgência (mesma paleta dos `Badge`s), usada nas pílulas da visão Mês. */
const TONE_COLOR: Record<string, string> = {
  default: "#9aa4b2",
  info: "#3b82f6",
  success: "#22c55e",
  warning: "#f59e0b",
  danger: "#ef4444",
};

/** Ocorrências que já saíram do radar do dia a dia — só aparecem se o usuário pedir "ver histórico". */
const HISTORICO_STATUS = new Set(["CONCLUIDA", "CANCELADA"]);

function capitalize(s: string) {
  return s.length ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

/** Etiqueta + tom do cabeçalho de cada grupo de data na visão Lista — sempre baseada só na
 * distância até hoje (independe do status de cada ocorrência do dia), pra deixar bem claro o que
 * vem primeiro: atrasada, hoje, amanhã, esta semana ou mais adiante. */
function dataGroupBadge(referenceISO: string): { label: string; tone: "default" | "warning" | "danger" } {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const dia = new Date(referenceISO);
  dia.setHours(0, 0, 0, 0);
  const diffDias = Math.round((dia.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDias < 0) return { label: "Atrasada", tone: "danger" };
  if (diffDias === 0) return { label: "Hoje", tone: "warning" };
  if (diffDias === 1) return { label: "Amanhã", tone: "warning" };
  if (diffDias <= 7) return { label: capitalize(format(dia, "EEEE", { locale: ptBR })), tone: "warning" };
  return { label: "Programada", tone: "default" };
}

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
  const [showHistorico, setShowHistorico] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [showRegistroFor, setShowRegistroFor] = useState<PreventivaOcorrenciaDTO | null>(null);
  const [detailOcorrencia, setDetailOcorrencia] = useState<PreventivaOcorrenciaDTO | null>(null);
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

  // Preventivas concluídas/canceladas se acumulam no histórico pra sempre (é o registro do que já
  // aconteceu) — sem esconder por padrão, elas dominariam o topo da ordenação "mais próximas
  // primeiro" com ocorrências antigas já resolvidas. Por padrão só mostramos o que ainda está
  // pendente (programada ou em execução); "Ver histórico" reexibe tudo.
  const pendentes = useMemo(() => filtered.filter((o) => !HISTORICO_STATUS.has(o.status)), [filtered]);
  const visible = showHistorico ? filtered : pendentes;
  const historicoCount = filtered.length - pendentes.length;

  // Resumo "o que vem primeiro" — só considera ocorrências PROGRAMADA (ainda aguardando),
  // já que Em execução/Concluída/Cancelada têm um sentido próprio que não é sobre distância de data.
  const resumo = useMemo(() => {
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    let atrasadas = 0;
    let hojeCount = 0;
    let semana = 0;
    let futuras = 0;
    for (const o of filtered) {
      if (o.status !== "PROGRAMADA") continue;
      const dia = new Date(o.dataProgramada);
      dia.setHours(0, 0, 0, 0);
      const diffDias = Math.round((dia.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24));
      if (diffDias < 0) atrasadas++;
      else if (diffDias === 0) hojeCount++;
      else if (diffDias <= 7) semana++;
      else futuras++;
    }
    return { atrasadas, hoje: hojeCount, semana, futuras };
  }, [filtered]);

  const grouped = useMemo(() => {
    const groups = new Map<string, PreventivaOcorrenciaDTO[]>();
    for (const o of visible) {
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
    return [...groups.entries()].map(([key, items]) => ({ key, items }));
  }, [visible, groupBy]);

  function ocorrenciasNoDia(day: Date) {
    return visible.filter((o) => {
      const d = new Date(o.dataProgramada);
      return d.getFullYear() === day.getFullYear() && d.getMonth() === day.getMonth() && d.getDate() === day.getDate();
    });
  }

  async function updateStatus(id: string, status: string) {
    setDetailOcorrencia(null);
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

  function openRegistro(o: PreventivaOcorrenciaDTO) {
    setDetailOcorrencia(null);
    setShowRegistroFor(o);
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
      setDetailOcorrencia(null);
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
            <button className="text-xs px-2.5 py-1 rounded-lg bg-nord-success/15 text-nord-success hover:bg-nord-success/25" onClick={() => openRegistro(o)} disabled={saving}>
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
            <button className="text-xs px-2.5 py-1 rounded-lg bg-nord-success/15 text-nord-success hover:bg-nord-success/25" onClick={() => openRegistro(o)} disabled={saving}>
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
    <div className="space-y-6">
      <SortableStatCards
        storageKey="manutencao-calendario-kpi-order"
        className="grid grid-cols-2 md:grid-cols-4 gap-4"
        cards={[
          { key: "atrasadas", label: "Atrasadas", value: formatNumber(resumo.atrasadas), icon: "AlertTriangle", color: "#ef4444" },
          { key: "vencem-hoje", label: "Vencem hoje", value: formatNumber(resumo.hoje), icon: "CalendarClock", color: "#f59e0b" },
          { key: "esta-semana", label: "Esta semana", value: formatNumber(resumo.semana), icon: "CalendarDays", color: "#3b82f6" },
          { key: "programadas", label: "Programadas", value: formatNumber(resumo.futuras), icon: "CalendarCheck2" },
        ]}
      />

      <Section
        title="Calendário preventivo"
        action={
          <div className="flex items-center gap-2 flex-wrap justify-end">
            <select className="input-sm" value={setorFilter} onChange={(e) => setSetorFilter(e.target.value)}>
              <option value="">Todos os setores</option>
              {setores.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            {view === "lista" && (
              <select className="input-sm" value={groupBy} onChange={(e) => setGroupBy(e.target.value as GroupKey)}>
                <option value="data">Agrupar por data</option>
                <option value="equipamento">Agrupar por equipamento</option>
                <option value="loja">Agrupar por loja</option>
                <option value="setor">Agrupar por setor</option>
              </select>
            )}
            {historicoCount > 0 && (
              <button
                onClick={() => setShowHistorico((v) => !v)}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs border ${
                  showHistorico ? "border-nord-blue text-nord-blue-light bg-nord-blue/10" : "border-nord-border text-nord-gray hover:text-white"
                }`}
                title="Concluídas e canceladas ficam fora da lista por padrão pra não esconder o que ainda está por vir"
              >
                <History size={13} /> {showHistorico ? "Ocultar histórico" : `Ver histórico (${historicoCount})`}
              </button>
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
            {grouped.map(({ key, items }) => {
              // Grupo com só ocorrências já concluídas/canceladas (só aparece com "Ver histórico"
              // ligado): rótulo de urgência baseado em data ("Atrasada") não faz sentido pra algo
              // que já foi resolvido, então usamos um rótulo neutro nesse caso.
              const allHistorico = items.every((o) => HISTORICO_STATUS.has(o.status));
              const badge = groupBy === "data" ? (allHistorico ? { label: "Histórico", tone: "default" as const } : dataGroupBadge(items[0].dataProgramada)) : null;
              return (
                <div key={key}>
                  {badge ? (
                    <div className="flex items-center gap-2 mb-1.5">
                      <Badge tone={badge.tone}>{badge.label}</Badge>
                      <span className="text-white text-sm font-medium">{format(new Date(items[0].dataProgramada), "dd/MM/yyyy")}</span>
                    </div>
                  ) : (
                    <h4 className="text-white text-sm font-medium mb-1">{key}</h4>
                  )}
                  {items.map(renderOcorrenciaRow)}
                </div>
              );
            })}
            {grouped.length === 0 && (
              <p className="text-sm text-nord-gray text-center py-6">
                {showHistorico || historicoCount === 0
                  ? "Nenhuma manutenção preventiva programada."
                  : "Nenhuma manutenção preventiva pendente. Use \"Ver histórico\" para ver as já concluídas/canceladas."}
              </p>
            )}
          </div>
        ) : (
          <MonthCalendar
            cursor={monthCursor}
            onCursorChange={setMonthCursor}
            renderDay={(day, { inMonth, isToday }) => {
              const items = ocorrenciasNoDia(day);
              return (
                <div
                  className={`min-h-[92px] rounded-lg border p-1.5 ${
                    isToday ? "border-nord-blue bg-nord-blue/10" : "border-nord-border/60 bg-nord-panel/40"
                  } ${inMonth ? "" : "opacity-40"}`}
                >
                  <span className={`text-[11px] font-semibold ${isToday ? "text-nord-blue-light" : "text-nord-gray"}`}>{day.getDate()}</span>
                  <div className="space-y-0.5 mt-1">
                    {items.slice(0, 3).map((o) => {
                      const derived = describePreventivaOcorrenciaLabel(o.status, o.dataProgramada);
                      const color = TONE_COLOR[derived.tone];
                      return (
                        <button
                          key={o.id}
                          onClick={() => setDetailOcorrencia(o)}
                          className="w-full text-left text-[9px] leading-tight px-1 py-0.5 rounded truncate font-medium"
                          style={{ backgroundColor: `${color}22`, color, borderLeft: `2px solid ${color}` }}
                          title={`${o.preventiva.equipamento.nome} · ${derived.label}`}
                        >
                          {o.preventiva.horario ? `${o.preventiva.horario} ` : ""}
                          {o.preventiva.equipamento.nome}
                        </button>
                      );
                    })}
                    {items.length > 3 && <span className="text-[9px] text-nord-gray">+{items.length - 3} mais</span>}
                  </div>
                </div>
              );
            }}
          />
        )}
      </Section>

      <Modal open={!!detailOcorrencia} onClose={() => setDetailOcorrencia(null)} title="Detalhes da manutenção">
        {detailOcorrencia && renderOcorrenciaRow(detailOcorrencia)}
      </Modal>

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
    </div>
  );
}
