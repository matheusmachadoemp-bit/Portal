"use client";

import Link from "next/link";
import { format } from "date-fns";
import { Section, Badge } from "@/components/ui/stat-card";
import { SortableStatCards } from "@/components/ui/sortable-stat-cards";
import { formatCurrency } from "@/lib/calc";
import { CHAMADO_PRIORIDADE_COLOR, CHAMADO_PRIORIDADE_LABEL, CHAMADO_STATUS_LABEL, isChamadoOverdue } from "@/lib/manutencao";
import type { ChamadoDTO, EquipamentoDTO } from "./types";

type DashboardData = {
  kpis: {
    chamadosAbertos: number;
    chamadosUrgentes: number;
    manutencoesAtrasadas: number;
    proximasManutencoes: number;
    equipamentosParados: number;
    gastosMes: number;
    tempoMedioResolucaoHoras: number | null;
  };
  chamadosRecentes: ChamadoDTO[];
  proximasManutencoesList: EquipamentoDTO[];
  equipamentosCriticos: EquipamentoDTO[];
};

export function ManutencaoDashboardClient({ data }: { data: DashboardData }) {
  const { kpis } = data;

  return (
    <div className="space-y-6">
      <SortableStatCards
        storageKey="manutencao-kpi-order"
        className="grid grid-cols-2 md:grid-cols-4 gap-4"
        cards={[
          { key: "chamados-abertos", label: "Chamados abertos", value: String(kpis.chamadosAbertos), icon: "ClipboardList" },
          { key: "chamados-urgentes", label: "Chamados urgentes", value: String(kpis.chamadosUrgentes), icon: "AlertTriangle", color: "#ef4444" },
          { key: "manutencoes-atrasadas", label: "Manutenções atrasadas", value: String(kpis.manutencoesAtrasadas), icon: "Clock", color: "#f59e0b" },
          { key: "proximas-manutencoes", label: "Próximas manutenções", value: String(kpis.proximasManutencoes), icon: "CalendarClock", color: "#3b82f6" },
          { key: "equipamentos-parados", label: "Equipamentos parados", value: String(kpis.equipamentosParados), icon: "PauseCircle", color: "#ef4444" },
          { key: "gastos-mes", label: "Gastos com manutenção (mês)", value: formatCurrency(kpis.gastosMes), icon: "DollarSign", color: "#2952E3" },
          {
            key: "tempo-medio",
            label: "Tempo médio de resolução",
            value: kpis.tempoMedioResolucaoHoras != null ? `${kpis.tempoMedioResolucaoHoras.toFixed(1)}h` : "—",
            icon: "Timer",
            color: "#22c55e",
          },
        ]}
      />

      <Section title="Chamados recentes" action={<Link href="/portal/manutencao/chamados" className="text-xs text-nord-blue-light hover:underline">Ver todos</Link>}>
        <div className="overflow-x-auto nord-scrollbar">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-nord-gray border-b border-nord-border">
                <th className="py-2 pr-4">Protocolo</th>
                <th className="py-2 pr-4">Problema</th>
                <th className="py-2 pr-4">Equipamento</th>
                <th className="py-2 pr-4">Loja</th>
                <th className="py-2 pr-4">Setor</th>
                <th className="py-2 pr-4">Prioridade</th>
                <th className="py-2 pr-4">Status</th>
                <th className="py-2 pr-4">Responsável</th>
              </tr>
            </thead>
            <tbody>
              {data.chamadosRecentes.map((c) => (
                <tr
                  key={c.id}
                  onClick={() => (window.location.href = `/portal/manutencao/chamados/${c.id}`)}
                  className="border-b border-nord-border/50 hover:bg-white/5 cursor-pointer"
                >
                  <td className="py-2 pr-4 text-white font-mono text-xs">{c.protocolo}</td>
                  <td className="py-2 pr-4 text-white">{c.titulo}</td>
                  <td className="py-2 pr-4 text-nord-gray">{c.equipamento?.nome ?? "—"}</td>
                  <td className="py-2 pr-4 text-white">{c.empresa.name}</td>
                  <td className="py-2 pr-4 text-white">{c.setor}</td>
                  <td className="py-2 pr-4">
                    <span className="text-[11px] font-medium" style={{ color: CHAMADO_PRIORIDADE_COLOR[c.prioridade] }}>
                      {CHAMADO_PRIORIDADE_LABEL[c.prioridade] ?? c.prioridade}
                    </span>
                  </td>
                  <td className="py-2 pr-4">
                    <Badge tone={isChamadoOverdue(c) ? "danger" : "default"}>{CHAMADO_STATUS_LABEL[c.status] ?? c.status}</Badge>
                  </td>
                  <td className="py-2 pr-4 text-nord-gray">{c.responsavel?.name ?? "—"}</td>
                </tr>
              ))}
              {data.chamadosRecentes.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-6 text-center text-nord-gray">
                    Nenhum chamado registrado ainda.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Section title="Próximas manutenções">
          <div className="space-y-2">
            {data.proximasManutencoesList.map((e) => (
              <Link
                key={e.id}
                href={`/portal/manutencao/equipamentos/${e.id}`}
                className="flex items-center justify-between text-sm border-b border-nord-border/50 py-2 last:border-0 hover:bg-white/5 px-2 -mx-2 rounded"
              >
                <div>
                  <p className="text-white">{e.nome} <span className="text-nord-gray font-mono text-xs">({e.codigo})</span></p>
                  <p className="text-xs text-nord-gray">{e.empresa.name} · {e.setor}</p>
                </div>
                <span className="text-xs text-nord-gray">{e.proximaManutencaoEm ? format(new Date(e.proximaManutencaoEm), "dd/MM/yyyy") : "—"}</span>
              </Link>
            ))}
            {data.proximasManutencoesList.length === 0 && <p className="text-sm text-nord-gray text-center py-6">Nenhuma manutenção programada nos próximos 30 dias.</p>}
          </div>
        </Section>

        <Section title="Equipamentos críticos">
          <div className="space-y-2">
            {data.equipamentosCriticos.map((e) => (
              <Link
                key={e.id}
                href={`/portal/manutencao/equipamentos/${e.id}`}
                className="flex items-center justify-between text-sm border-b border-nord-border/50 py-2 last:border-0 hover:bg-white/5 px-2 -mx-2 rounded"
              >
                <div>
                  <p className="text-white">{e.nome} <span className="text-nord-gray font-mono text-xs">({e.codigo})</span></p>
                  <p className="text-xs text-nord-gray">{e.empresa.name} · {e.setor}</p>
                </div>
                <Badge tone={e.status === "PARADO" ? "danger" : "warning"}>{e.status === "PARADO" ? "Parado" : "Atenção"}</Badge>
              </Link>
            ))}
            {data.equipamentosCriticos.length === 0 && <p className="text-sm text-nord-gray text-center py-6">Nenhum equipamento crítico no momento.</p>}
          </div>
        </Section>
      </div>
    </div>
  );
}
