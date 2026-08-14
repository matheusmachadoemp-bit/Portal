"use client";

import { Download, Printer } from "lucide-react";
import { Section } from "@/components/ui/stat-card";
import { exportRowsToExcel, printCurrentPage } from "@/lib/export-utils";

type Report = { key: string; title: string; description: string; rows: Record<string, string | number>[] };

export function RelatoriosClient({ reports }: { reports: Report[] }) {
  return (
    <div className="space-y-6">
      <p className="text-xs text-nord-gray bg-nord-panel border border-nord-border rounded-lg px-3 py-2">
        Comparativos semana x semana, mês atual x anterior e Nord x Zarki estão disponíveis nas telas de{" "}
        <span className="text-white">Comparativo Real x Teórico</span> e <span className="text-white">Histórico de Contagens</span>.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {reports.map((r) => (
          <Section key={r.key} title={r.title}>
            <p className="text-xs text-nord-gray mb-4 min-h-[32px]">{r.description}</p>
            <div className="flex items-center justify-between">
              <span className="text-xs text-nord-gray">{r.rows.length} registro(s)</span>
              <div className="flex items-center gap-2">
                <button className="btn-outline" onClick={() => exportRowsToExcel(r.key, r.title, r.rows)} disabled={r.rows.length === 0}>
                  <Download size={13} /> Excel
                </button>
                <button className="btn-outline" onClick={printCurrentPage}>
                  <Printer size={13} /> Imprimir
                </button>
              </div>
            </div>
          </Section>
        ))}
      </div>
    </div>
  );
}
