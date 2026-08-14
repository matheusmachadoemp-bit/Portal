import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { formatCurrency } from "@/lib/calc";

export function exportFinanceToPdf(
  rows: { date: string; description: string; type: string; value: number; observacao?: string | null }[],
  typeLabels: Record<string, string>,
  options: { title?: string; subtitle?: string } = {}
) {
  const doc = new jsPDF();
  const title = options.title ?? "RH — Financeiro";

  doc.setFontSize(14);
  doc.text(title, 14, 16);
  if (options.subtitle) {
    doc.setFontSize(10);
    doc.setTextColor(120);
    doc.text(options.subtitle, 14, 22);
  }

  const total = rows.reduce((sum, r) => sum + r.value, 0);

  autoTable(doc, {
    startY: options.subtitle ? 28 : 22,
    head: [["Data", "Descrição", "Tipo", "Valor", "Observação"]],
    body: rows.map((r) => [
      new Date(r.date).toLocaleDateString("pt-BR"),
      r.description,
      typeLabels[r.type] ?? r.type,
      formatCurrency(r.value),
      r.observacao ?? "",
    ]),
    foot: [["", "", "Total", formatCurrency(total), ""]],
    headStyles: { fillColor: [41, 82, 227] },
    footStyles: { fillColor: [30, 30, 33], textColor: 255, fontStyle: "bold" },
    styles: { fontSize: 9 },
  });

  doc.save(`${title.toLowerCase().replace(/\s+/g, "-")}.pdf`);
}

export function exportRowsToPdf(title: string, headers: string[], rows: (string | number)[][]) {
  const doc = new jsPDF();
  doc.setFontSize(14);
  doc.text(title, 14, 16);

  autoTable(doc, {
    startY: 22,
    head: [headers],
    body: rows.map((r) => r.map((v) => String(v))),
    headStyles: { fillColor: [41, 82, 227] },
    styles: { fontSize: 9 },
  });

  doc.save(`${title.toLowerCase().replace(/\s+/g, "-")}.pdf`);
}
