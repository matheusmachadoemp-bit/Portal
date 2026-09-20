"use client";

import { FileText, FileSpreadsheet, FileDown } from "lucide-react";
import { Section } from "@/components/ui/stat-card";
import type { ReportDef } from "./page";

async function exportPdf(report: ReportDef) {
  const { exportRowsToPdf } = await import("@/lib/pdf-export");
  exportRowsToPdf(report.title, report.headers, report.rows);
}

function exportCsv(report: ReportDef) {
  const lines = [report.headers, ...report.rows].map((row) =>
    row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")
  );
  const csv = [...lines].join("\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${report.key}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

async function exportExcel(report: ReportDef) {
  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet(report.title.slice(0, 31));
  worksheet.addRows([report.headers, ...report.rows]);

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${report.key}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}

export function RelatoriosClient({ reports }: { reports: ReportDef[] }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      {reports.map((r) => (
        <Section key={r.key} title={r.title}>
          <div className="space-y-3">
            <p className="text-xs text-nord-gray">{r.description}</p>
            <p className="text-xs text-nord-gray">{r.rows.length} registros</p>
            <div className="flex items-center gap-2 pt-1">
              <button
                onClick={() => exportPdf(r)}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium border border-nord-border text-nord-gray hover:text-white"
              >
                <FileText size={12} /> PDF
              </button>
              <button
                onClick={() => exportExcel(r)}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium border border-nord-border text-nord-gray hover:text-white"
              >
                <FileSpreadsheet size={12} /> Excel
              </button>
              <button
                onClick={() => exportCsv(r)}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium border border-nord-border text-nord-gray hover:text-white"
              >
                <FileDown size={12} /> CSV
              </button>
            </div>
          </div>
        </Section>
      ))}
    </div>
  );
}
