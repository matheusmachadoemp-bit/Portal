"use client";

import { useMemo, useState } from "react";
import { Download } from "lucide-react";
import { Section, Badge } from "@/components/ui/stat-card";
import { Modal } from "@/components/ui/modal";
import { formatCurrency, formatNumber } from "@/lib/calc";
import { RFV_SEGMENTS, RFV_SEGMENT_TONE, type RfvSegment } from "@/lib/rfv";

type ClienteRfv = {
  clienteId: string;
  nome: string;
  telefone: string | null;
  diasDesdeUltimaCompra: number;
  frequencia: number;
  valor: number;
  segmento: RfvSegment;
};

export function RfvClient({ clientes }: { clientes: ClienteRfv[] }) {
  const [openSegment, setOpenSegment] = useState<RfvSegment | null>(null);

  const groups = useMemo(() => {
    return RFV_SEGMENTS.map((segmento) => {
      const items = clientes.filter((c) => c.segmento === segmento);
      const faturamento = items.reduce((sum, c) => sum + c.valor, 0);
      const ticketMedio = items.length ? faturamento / items.reduce((sum, c) => sum + c.frequencia, 0) : 0;
      const mediaDias = items.length ? items.reduce((sum, c) => sum + c.diasDesdeUltimaCompra, 0) / items.length : 0;
      return { segmento, items, faturamento, ticketMedio, mediaDias };
    });
  }, [clientes]);

  const activeGroup = groups.find((g) => g.segmento === openSegment);

  function exportSegment(segmento: RfvSegment) {
    const group = groups.find((g) => g.segmento === segmento);
    if (!group) return;
    const header = "Nome,Telefone,Faturamento,Compras,Dias desde ultima compra\n";
    const rows = group.items
      .map((c) => `"${c.nome}","${c.telefone ?? ""}",${c.valor.toFixed(2)},${c.frequencia},${c.diasDesdeUltimaCompra}`)
      .join("\n");
    const blob = new Blob([header + rows], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `clientes-${segmento.toLowerCase().replace(/\s+/g, "-")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Section title={`Segmentação RFV (${clientes.length} clientes com histórico de compra)`}>
      <p className="text-xs text-nord-gray mb-4">
        Recência (dias desde a última compra), Frequência (nº de compras) e Valor (total gasto) — clique em um
        segmento para ver os clientes.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {groups.map((g) => (
          <button key={g.segmento} onClick={() => setOpenSegment(g.segmento)} className="text-left nord-card p-4 hover:border-nord-blue transition-colors">
            <div className="flex items-center justify-between mb-2">
              <Badge tone={RFV_SEGMENT_TONE[g.segmento]}>{g.segmento}</Badge>
              <span className="text-white text-lg font-semibold">{g.items.length}</span>
            </div>
            <div className="space-y-0.5 text-xs text-nord-gray">
              <p>Faturamento: <span className="text-white">{formatCurrency(g.faturamento)}</span></p>
              <p>Ticket médio: <span className="text-white">{formatCurrency(g.ticketMedio)}</span></p>
              <p>Última compra média: <span className="text-white">{formatNumber(g.mediaDias)} dias</span></p>
            </div>
          </button>
        ))}
      </div>

      <Modal open={!!openSegment} onClose={() => setOpenSegment(null)} title={openSegment ?? ""} widthClass="max-w-2xl">
        {activeGroup && (
          <div className="space-y-3">
            <button
              onClick={() => exportSegment(activeGroup.segmento)}
              className="flex items-center gap-1.5 text-xs text-nord-blue-light hover:text-white"
            >
              <Download size={13} /> Exportar lista (CSV)
            </button>
            <div className="overflow-x-auto nord-scrollbar max-h-96">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-nord-gray border-b border-nord-border">
                    <th className="py-2 pr-4">Nome</th>
                    <th className="py-2 pr-4">Telefone</th>
                    <th className="py-2 pr-4">Faturamento</th>
                    <th className="py-2 pr-4">Compras</th>
                    <th className="py-2 pr-4">Última compra</th>
                  </tr>
                </thead>
                <tbody>
                  {activeGroup.items.map((c) => (
                    <tr key={c.clienteId} className="border-b border-nord-border/50">
                      <td className="py-2 pr-4 text-white">{c.nome}</td>
                      <td className="py-2 pr-4 text-nord-gray">{c.telefone ?? "-"}</td>
                      <td className="py-2 pr-4 text-nord-gray">{formatCurrency(c.valor)}</td>
                      <td className="py-2 pr-4 text-nord-gray">{c.frequencia}</td>
                      <td className="py-2 pr-4 text-nord-gray">{c.diasDesdeUltimaCompra}d atrás</td>
                    </tr>
                  ))}
                  {activeGroup.items.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-4 text-center text-nord-gray">
                        Nenhum cliente neste segmento.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Modal>
    </Section>
  );
}
