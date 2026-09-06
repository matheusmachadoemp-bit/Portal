"use client";

import { useState } from "react";
import { Download, FileText } from "lucide-react";
import { Section, Badge } from "@/components/ui/stat-card";
import { SortableStatCards } from "@/components/ui/sortable-stat-cards";
import { formatCurrency } from "@/lib/calc";
import { exportRowsToExcel } from "@/lib/export-utils";
import { exportKpiReportToPdf } from "@/lib/pdf-export";
import { CHAMADO_PRIORIDADE_LABEL } from "@/lib/manutencao";

type KeyValor = { key: string; valor: number };
type KeyTotal = { key: string; total: number };

export type RelatorioData = {
  custoTotal: number;
  gastosPorLoja: KeyValor[];
  gastosPorSetor: KeyValor[];
  gastosPorCategoria: KeyValor[];
  gastosPorPrestador: KeyValor[];
  gastosPorEquipamento: KeyValor[];
  equipamentosComMaisProblemas: KeyTotal[];
  chamadosPorSetor: KeyTotal[];
  chamadosPorPrioridade: KeyTotal[];
  tempoMedioResolucaoHoras: number | null;
  preventivasConcluidas: number;
  preventivasAtrasadas: number;
  preventivasNoPrazoPercent: number | null;
  equipamentosParados: number;
  comparativoSubstituicao: { nome: string; custoAcumulado: number; valorCompra: number }[];
  totalChamados: number;
  totalRegistros: number;
};

type Option = { id: string; nome: string };

export function RelatoriosClient({
  initialData,
  equipamentos,
  prestadores,
}: {
  initialData: RelatorioData;
  equipamentos: Option[];
  prestadores: Option[];
}) {
  const [data, setData] = useState(initialData);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [setor, setSetor] = useState("");
  const [equipamentoId, setEquipamentoId] = useState("");
  const [prestadorId, setPrestadorId] = useState("");
  const [loading, setLoading] = useState(false);

  async function applyFilters() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      if (setor) params.set("setor", setor);
      if (equipamentoId) params.set("equipamentoId", equipamentoId);
      if (prestadorId) params.set("prestadorId", prestadorId);
      const res = await fetch(`/api/manutencao/relatorios?${params.toString()}`);
      const json = await res.json();
      setData(json);
    } finally {
      setLoading(false);
    }
  }

  function limparFiltros() {
    setFrom("");
    setTo("");
    setSetor("");
    setEquipamentoId("");
    setPrestadorId("");
    setData(initialData);
  }

  function exportPdf() {
    exportKpiReportToPdf("Manutenção — Relatório", `Gerado em ${new Date().toLocaleDateString("pt-BR")}`, [
      { title: "Gastos por loja", rows: data.gastosPorLoja.map((g) => [g.key, formatCurrency(g.valor)] as [string, string]) },
      { title: "Gastos por setor", rows: data.gastosPorSetor.map((g) => [g.key, formatCurrency(g.valor)] as [string, string]) },
      { title: "Gastos por categoria", rows: data.gastosPorCategoria.map((g) => [g.key, formatCurrency(g.valor)] as [string, string]) },
      { title: "Gastos por prestador", rows: data.gastosPorPrestador.map((g) => [g.key, formatCurrency(g.valor)] as [string, string]) },
      { title: "Equipamentos com mais problemas", rows: data.equipamentosComMaisProblemas.map((g) => [g.key, String(g.total)] as [string, string]) },
      { title: "Chamados por setor", rows: data.chamadosPorSetor.map((g) => [g.key, String(g.total)] as [string, string]) },
    ]);
  }

  return (
    <div className="space-y-6">
      <Section title="Filtros">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="text-xs text-nord-gray mb-1 block">De</label>
            <input type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-nord-gray mb-1 block">Até</label>
            <input type="date" className="input" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-nord-gray mb-1 block">Setor</label>
            <input className="input w-40" value={setor} onChange={(e) => setSetor(e.target.value)} placeholder="Ex.: Cozinha" />
          </div>
          <div>
            <label className="text-xs text-nord-gray mb-1 block">Equipamento</label>
            <select className="input w-48" value={equipamentoId} onChange={(e) => setEquipamentoId(e.target.value)}>
              <option value="">Todos</option>
              {equipamentos.map((e) => (
                <option key={e.id} value={e.id}>{e.nome}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-nord-gray mb-1 block">Prestador</label>
            <select className="input w-48" value={prestadorId} onChange={(e) => setPrestadorId(e.target.value)}>
              <option value="">Todos</option>
              {prestadores.map((p) => (
                <option key={p.id} value={p.id}>{p.nome}</option>
              ))}
            </select>
          </div>
          <button className="btn-primary" onClick={applyFilters} disabled={loading}>
            {loading ? "Aplicando..." : "Aplicar filtros"}
          </button>
          <button className="btn-outline" onClick={limparFiltros} disabled={loading}>
            Limpar filtros
          </button>
          <button className="btn-outline ml-auto" onClick={exportPdf}>
            <FileText size={13} /> Exportar PDF
          </button>
        </div>
      </Section>

      <SortableStatCards
        storageKey="manutencao-relatorio-kpi-order"
        className="grid grid-cols-2 md:grid-cols-4 gap-4"
        cards={[
          { key: "custo-total", label: "Custo total no período", value: formatCurrency(data.custoTotal), icon: "DollarSign", color: "#2952E3" },
          { key: "total-chamados", label: "Chamados no período", value: String(data.totalChamados), icon: "ClipboardList" },
          {
            key: "tempo-medio",
            label: "Tempo médio de resolução",
            value: data.tempoMedioResolucaoHoras != null ? `${data.tempoMedioResolucaoHoras.toFixed(1)}h` : "—",
            icon: "Timer",
            color: "#22c55e",
          },
          { key: "equipamentos-parados", label: "Equipamentos parados", value: String(data.equipamentosParados), icon: "PauseCircle", color: "#ef4444" },
          { key: "preventivas-concluidas", label: "Preventivas concluídas", value: String(data.preventivasConcluidas), icon: "CheckCircle2", color: "#22c55e" },
          { key: "preventivas-atrasadas", label: "Preventivas atrasadas", value: String(data.preventivasAtrasadas), icon: "Clock", color: "#f59e0b" },
          {
            key: "preventivas-no-prazo",
            label: "% preventivas no prazo",
            value: data.preventivasNoPrazoPercent != null ? `${data.preventivasNoPrazoPercent.toFixed(0)}%` : "—",
            icon: "Percent",
          },
          { key: "total-registros", label: "Manutenções registradas", value: String(data.totalRegistros), icon: "Wrench" },
        ]}
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <RankingTable title="Gastos por loja" rows={data.gastosPorLoja} formatValor={formatCurrency} exportName="gastos-por-loja" />
        <RankingTable title="Gastos por setor" rows={data.gastosPorSetor} formatValor={formatCurrency} exportName="gastos-por-setor" />
        <RankingTable title="Gastos por categoria" rows={data.gastosPorCategoria} formatValor={formatCurrency} exportName="gastos-por-categoria" />
        <RankingTable title="Gastos por prestador" rows={data.gastosPorPrestador} formatValor={formatCurrency} exportName="gastos-por-prestador" />
        <RankingTable title="Gastos por equipamento (top 10)" rows={data.gastosPorEquipamento} formatValor={formatCurrency} exportName="gastos-por-equipamento" />
        <CountTable title="Equipamentos com mais chamados" rows={data.equipamentosComMaisProblemas} exportName="equipamentos-mais-problemas" />
        <CountTable title="Chamados por setor" rows={data.chamadosPorSetor} exportName="chamados-por-setor" />
        <CountTable
          title="Chamados por prioridade"
          rows={data.chamadosPorPrioridade.map((r) => ({ key: CHAMADO_PRIORIDADE_LABEL[r.key] ?? r.key, total: r.total }))}
          exportName="chamados-por-prioridade"
        />
      </div>

      <Section title="Equipamentos a considerar substituição (custo acumulado > 50% do valor de compra)">
        <div className="space-y-2">
          {data.comparativoSubstituicao.map((e) => (
            <div key={e.nome} className="flex items-center justify-between text-sm border-b border-nord-border/50 py-2 last:border-0">
              <span className="text-white">{e.nome}</span>
              <span className="flex items-center gap-2">
                <span className="text-nord-gray text-xs">{formatCurrency(e.custoAcumulado)} / {formatCurrency(e.valorCompra)}</span>
                <Badge tone="warning">{((e.custoAcumulado / e.valorCompra) * 100).toFixed(0)}%</Badge>
              </span>
            </div>
          ))}
          {data.comparativoSubstituicao.length === 0 && <p className="text-sm text-nord-gray text-center py-4">Nenhum equipamento nessa condição.</p>}
        </div>
      </Section>
    </div>
  );
}

function RankingTable({ title, rows, formatValor, exportName }: { title: string; rows: KeyValor[]; formatValor: (v: number) => string; exportName: string }) {
  return (
    <Section
      title={title}
      action={
        rows.length > 0 && (
          <button
            className="text-xs text-nord-blue-light hover:underline flex items-center gap-1"
            onClick={() => exportRowsToExcel(exportName, title, rows.map((r) => ({ Item: r.key, Valor: r.valor })))}
          >
            <Download size={12} /> Excel
          </button>
        )
      }
    >
      <div className="space-y-1.5">
        {rows.slice(0, 10).map((r) => (
          <div key={r.key} className="flex items-center justify-between text-sm">
            <span className="text-white truncate">{r.key}</span>
            <span className="text-nord-gray">{formatValor(r.valor)}</span>
          </div>
        ))}
        {rows.length === 0 && <p className="text-sm text-nord-gray text-center py-4">Sem dados no período.</p>}
      </div>
    </Section>
  );
}

function CountTable({ title, rows, exportName }: { title: string; rows: KeyTotal[]; exportName: string }) {
  return (
    <Section
      title={title}
      action={
        rows.length > 0 && (
          <button
            className="text-xs text-nord-blue-light hover:underline flex items-center gap-1"
            onClick={() => exportRowsToExcel(exportName, title, rows.map((r) => ({ Item: r.key, Total: r.total })))}
          >
            <Download size={12} /> Excel
          </button>
        )
      }
    >
      <div className="space-y-1.5">
        {rows.slice(0, 10).map((r) => (
          <div key={r.key} className="flex items-center justify-between text-sm">
            <span className="text-white truncate">{r.key}</span>
            <Badge>{r.total}</Badge>
          </div>
        ))}
        {rows.length === 0 && <p className="text-sm text-nord-gray text-center py-4">Sem dados no período.</p>}
      </div>
    </Section>
  );
}
