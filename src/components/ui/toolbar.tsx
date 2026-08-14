"use client";

import { ReactNode } from "react";
import { Download, Plus, Printer, RefreshCw } from "lucide-react";
import { exportRowsToExcel, printCurrentPage } from "@/lib/export-utils";

export function Toolbar({
  filters,
  exportFilename,
  exportSheetName,
  exportRows,
  onRefresh,
  onAdd,
  addLabel = "Adicionar",
}: {
  filters?: ReactNode;
  exportFilename?: string;
  exportSheetName?: string;
  exportRows?: () => Record<string, string | number>[];
  onRefresh?: () => void;
  onAdd?: () => void;
  addLabel?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 flex-wrap">
      <div className="flex items-center gap-2 flex-wrap">{filters}</div>
      <div className="flex items-center gap-2 flex-wrap">
        {exportRows && exportFilename && (
          <button
            className="btn-outline"
            onClick={() => exportRowsToExcel(exportFilename, exportSheetName ?? exportFilename, exportRows())}
          >
            <Download size={13} /> Excel
          </button>
        )}
        {exportRows && (
          <button className="btn-outline" onClick={printCurrentPage}>
            <Printer size={13} /> Imprimir
          </button>
        )}
        {onRefresh && (
          <button className="btn-outline" onClick={onRefresh}>
            <RefreshCw size={13} /> Atualizar
          </button>
        )}
        {onAdd && (
          <button className="btn-primary" onClick={onAdd}>
            <Plus size={14} /> {addLabel}
          </button>
        )}
      </div>
    </div>
  );
}
