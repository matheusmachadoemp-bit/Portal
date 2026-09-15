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

/** Relatório em PDF organizado por seções de pares rótulo/valor (KPIs), sem tabela tabular. */
export function exportKpiReportToPdf(
  title: string,
  subtitle: string,
  sections: { title: string; rows: [string, string][] }[]
) {
  const doc = new jsPDF();
  doc.setFontSize(14);
  doc.text(title, 14, 16);
  doc.setFontSize(10);
  doc.setTextColor(120);
  doc.text(subtitle, 14, 22);

  let startY = 30;
  for (const section of sections) {
    autoTable(doc, {
      startY,
      head: [[section.title, ""]],
      body: section.rows,
      headStyles: { fillColor: [41, 82, 227] },
      styles: { fontSize: 9 },
      columnStyles: { 1: { halign: "right" } },
    });
    startY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;
  }

  doc.save(`${title.toLowerCase().replace(/\s+/g, "-")}.pdf`);
}

const COMPARE_COLOR_A: [number, number, number] = [59, 130, 246]; // #3b82f6 — Data A (azul), mesma cor usada na tela
const COMPARE_COLOR_B: [number, number, number] = [245, 158, 11]; // #f59e0b — Data B (âmbar), mesma cor usada na tela

/**
 * Desenha um rótulo de valor centralizado em `centerX`, reduzindo o tamanho da fonte
 * (até um mínimo) se o texto for mais largo que `maxWidth` — evita que rótulos de
 * valores longos (ex.: "R$ 25.600,00") se sobreponham ao rótulo da barra vizinha em
 * layouts com várias colunas lado a lado.
 */
function drawFittedValueLabel(doc: jsPDF, text: string, centerX: number, y: number, maxWidth: number) {
  const baseSize = 7;
  const minSize = 5;
  doc.setFontSize(baseSize);
  const width = doc.getTextWidth(text);
  const fontSize = width > maxWidth ? Math.max(minSize, baseSize * (maxWidth / width)) : baseSize;
  doc.setFontSize(fontSize);
  doc.text(text, centerX, y, { align: "center" });
}

/**
 * Desenha, na posição atual do documento, um gráfico de barras agrupadas comparando
 * duas séries (Data A x Data B) — uma barra azul e uma âmbar lado a lado por grupo,
 * com o valor formatado acima de cada barra e o rótulo do grupo abaixo. Retorna o Y
 * logo após o gráfico, para o chamador continuar desenhando (ex.: uma tabela).
 */
function drawComparisonChart(
  doc: jsPDF,
  startY: number,
  groups: { label: string; valueA: number; valueB: number; formatValue: (n: number) => string }[]
): number {
  const pageWidth = doc.internal.pageSize.getWidth();
  const marginX = 14;
  const chartWidth = pageWidth - marginX * 2;
  const chartHeight = 45;
  const labelAreaHeight = 10;
  const valueAreaHeight = 6;
  const barsAreaHeight = chartHeight - labelAreaHeight - valueAreaHeight;
  const baselineY = startY + valueAreaHeight + barsAreaHeight;

  const groupWidth = chartWidth / Math.max(groups.length, 1);
  const barWidth = Math.min(16, groupWidth / 3);

  doc.setFontSize(7);
  groups.forEach((g, i) => {
    const groupCenter = marginX + groupWidth * i + groupWidth / 2;
    const xA = groupCenter - barWidth - 1;
    const xB = groupCenter + 1;

    // Cada grupo (par de barras A/B) é normalizado pela própria escala — igual ao
    // gráfico da tela (GroupedBars) — para permitir combinar métricas de unidades
    // diferentes (ex.: R$ e quantidade de pedidos) no mesmo gráfico sem distorcer.
    const maxValue = Math.max(g.valueA, g.valueB, 1);
    const heightA = Math.max(1, (g.valueA / maxValue) * barsAreaHeight);
    const heightB = Math.max(1, (g.valueB / maxValue) * barsAreaHeight);

    doc.setFillColor(...COMPARE_COLOR_A);
    doc.rect(xA, baselineY - heightA, barWidth, heightA, "F");
    doc.setFillColor(...COMPARE_COLOR_B);
    doc.rect(xB, baselineY - heightB, barWidth, heightB, "F");

    // Espaço disponível por rótulo = distância entre os centros das duas barras do
    // grupo (com uma pequena folga) — é o limite real antes de um rótulo esbarrar no
    // do lado, então é o que usamos pra decidir se a fonte precisa encolher.
    const labelMaxWidth = xB - xA + 4;
    doc.setTextColor(40);
    drawFittedValueLabel(doc, g.formatValue(g.valueA), xA + barWidth / 2, baselineY - heightA - 2, labelMaxWidth);
    drawFittedValueLabel(doc, g.formatValue(g.valueB), xB + barWidth / 2, baselineY - heightB - 2, labelMaxWidth);

    doc.setFontSize(8);
    doc.setTextColor(80);
    doc.text(g.label, groupCenter, baselineY + 6, { align: "center", maxWidth: groupWidth - 2 });
    doc.setFontSize(7);
  });

  doc.setDrawColor(200);
  doc.line(marginX, baselineY, marginX + chartWidth, baselineY);

  return baselineY + labelAreaHeight;
}

/** Desenha a legenda de cores (Data A / Data B) acima de um gráfico comparativo. */
function drawComparisonLegend(doc: jsPDF, startY: number, labelA: string, labelB: string): number {
  const marginX = 14;
  const swatchSize = 3;

  doc.setFillColor(...COMPARE_COLOR_A);
  doc.rect(marginX, startY - swatchSize, swatchSize, swatchSize, "F");
  doc.setFontSize(9);
  doc.setTextColor(80);
  doc.text(labelA, marginX + swatchSize + 2, startY);

  const labelAWidth = doc.getTextWidth(labelA);
  const labelBX = marginX + swatchSize + 2 + labelAWidth + 8;
  doc.setFillColor(...COMPARE_COLOR_B);
  doc.rect(labelBX, startY - swatchSize, swatchSize, swatchSize, "F");
  doc.text(labelB, labelBX + swatchSize + 2, startY);

  return startY + 6;
}

/**
 * Relatório em PDF com gráfico de barras comparando dois períodos (Data A x Data B),
 * com cores diferentes por período (azul x âmbar), seguido da tabela de dados —
 * usado pela tela de Acompanhamento de Vendas.
 */
export function exportComparisonReportToPdf(
  title: string,
  subtitle: string,
  labelA: string,
  labelB: string,
  sections: {
    title: string;
    chart?: { groups: { label: string; valueA: number; valueB: number; formatValue: (n: number) => string }[] };
    tableHead: string[];
    tableRows: (string | number)[][];
  }[]
) {
  const doc = new jsPDF();
  doc.setFontSize(14);
  doc.setTextColor(0);
  doc.text(title, 14, 16);
  doc.setFontSize(10);
  doc.setTextColor(120);
  doc.text(subtitle, 14, 22);

  let startY = 30;
  const pageHeight = doc.internal.pageSize.getHeight();

  for (const section of sections) {
    if (startY > pageHeight - 70) {
      doc.addPage();
      startY = 20;
    }

    doc.setFontSize(11);
    doc.setTextColor(30);
    doc.text(section.title, 14, startY);
    startY += 7;

    if (section.chart && section.chart.groups.length > 0) {
      startY = drawComparisonLegend(doc, startY, labelA, labelB);
      startY = drawComparisonChart(doc, startY, section.chart.groups);
      startY += 4;
    }

    autoTable(doc, {
      startY,
      head: [section.tableHead],
      body: section.tableRows.map((r) => r.map((v) => String(v))),
      headStyles: { fillColor: [41, 82, 227] },
      styles: { fontSize: 9 },
    });
    startY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 12;
  }

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
