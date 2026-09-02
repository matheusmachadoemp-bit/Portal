import jsPDF from "jspdf";

// Paleta do design system (DESIGN_SYSTEM.md), em RGB.
const COLOR = {
  blue: [20, 100, 244] as const,
  blueLight: [59, 130, 246] as const,
  dark: [21, 26, 35] as const,
  gray: [110, 118, 130] as const,
  grayLight: [154, 164, 178] as const,
  border: [226, 230, 236] as const,
  panel: [246, 248, 251] as const,
  white: [255, 255, 255] as const,
  success: [34, 197, 94] as const,
  warning: [245, 158, 11] as const,
  danger: [239, 68, 68] as const,
};

type Unit = "percent" | "currency" | "minutes";
type Status = "batida" | "abaixo" | "sem-dado";
type MetaDirection = "max" | "min";

export type MeetingIndicator = {
  key: string;
  label: string;
  color: readonly [number, number, number];
  unit: Unit;
  valorAtual: number | null;
  valorAnterior: number | null;
  meta: number;
  metaDirection: MetaDirection;
  status: Status;
  premio: number;
};

function formatValue(unit: Unit, value: number | null) {
  if (value === null) return "-";
  if (unit === "percent") return `${value.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
  if (unit === "minutes") return `${value.toLocaleString("pt-BR", { maximumFractionDigits: 0 })} min`;
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatPercent1(value: number) {
  return value.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

function statusStyle(status: Status) {
  if (status === "batida") return { label: "Meta batida", color: COLOR.success };
  if (status === "abaixo") return { label: "Abaixo da meta", color: COLOR.warning };
  return { label: "Sem dado", color: COLOR.grayLight };
}

/** % de variação e se essa variação é boa (verde) ou ruim (vermelho) para o indicador. */
function deltaInfo(indicator: MeetingIndicator) {
  const { valorAtual, valorAnterior, metaDirection } = indicator;
  if (valorAtual === null || valorAnterior === null || valorAnterior === 0) return null;
  const pct = ((valorAtual - valorAnterior) / Math.abs(valorAnterior)) * 100;
  const melhorou = metaDirection === "min" ? pct <= 0 : pct >= 0;
  return { pct, melhorou };
}

function setColor(doc: jsPDF, method: "setFillColor" | "setDrawColor" | "setTextColor", color: readonly [number, number, number]) {
  doc[method](color[0], color[1], color[2]);
}

function drawBadge(doc: jsPDF, text: string, x: number, y: number, color: readonly [number, number, number], fontSize = 9) {
  doc.setFontSize(fontSize);
  const w = doc.getTextWidth(text) + 8;
  setColor(doc, "setFillColor", color);
  doc.roundedRect(x, y, w, fontSize * 0.75, fontSize * 0.35, fontSize * 0.35, "F");
  setColor(doc, "setTextColor", COLOR.white);
  doc.text(text, x + 4, y + fontSize * 0.52);
  return w;
}

function drawTriangle(doc: jsPDF, cx: number, cy: number, up: boolean, color: readonly [number, number, number]) {
  setColor(doc, "setFillColor", color);
  if (up) doc.triangle(cx - 2, cy + 1.6, cx + 2, cy + 1.6, cx, cy - 1.6, "F");
  else doc.triangle(cx - 2, cy - 1.6, cx + 2, cy - 1.6, cx, cy + 1.6, "F");
}

function drawFooter(doc: jsPDF, pageWidth: number, pageHeight: number, margin: number) {
  setColor(doc, "setDrawColor", COLOR.border);
  doc.line(margin, pageHeight - 14, pageWidth - margin, pageHeight - 14);
  setColor(doc, "setTextColor", COLOR.grayLight);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.text(`Gerado em ${new Date().toLocaleString("pt-BR")} pelo Portal Nord`, margin, pageHeight - 9);
}

function drawHeader(doc: jsPDF, pageWidth: number, margin: number, title: string, empresaName: string, periodoLabelStr: string) {
  setColor(doc, "setFillColor", COLOR.blue);
  doc.rect(0, 0, pageWidth, 26, "F");
  setColor(doc, "setTextColor", COLOR.white);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(17);
  doc.text(title, margin, 13);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(`${empresaName} · Fechamento de ${periodoLabelStr}`, margin, 20);
}

/**
 * Gera um PDF com uma página inteira por indicador (gráfico de colunas
 * grande, mês atual x mês anterior) mais uma página de resumo/premiação.
 */
export function exportCozinhaMeetingPdf(params: {
  empresaName: string;
  periodoLabel: string;
  periodoAtualShort: string;
  periodoAnteriorShort: string | null;
  indicators: MeetingIndicator[];
  premiacaoTotal: number;
  observacoes: string;
}) {
  const { empresaName, periodoLabel, periodoAtualShort, periodoAnteriorShort, indicators, premiacaoTotal, observacoes } = params;
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 16;

  indicators.forEach((ind, i) => {
    if (i > 0) doc.addPage();
    drawHeader(doc, pageWidth, margin, "Reunião Cozinha", empresaName, periodoLabel);

    // Título do indicador + status
    setColor(doc, "setTextColor", COLOR.dark);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(20);
    doc.text(ind.label, margin, 42);
    const st = statusStyle(ind.status);
    drawBadge(doc, st.label, margin, 46, st.color, 10);

    // Valor atual em destaque + variação
    doc.setFont("helvetica", "bold");
    doc.setFontSize(30);
    setColor(doc, "setTextColor", ind.color);
    doc.text(formatValue(ind.unit, ind.valorAtual), margin, 68);

    const delta = deltaInfo(ind);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    if (delta) {
      const deltaColor = delta.melhorou ? COLOR.success : COLOR.danger;
      drawTriangle(doc, margin + 2.5, 74.5, delta.pct >= 0, deltaColor);
      setColor(doc, "setTextColor", deltaColor);
      doc.text(`${formatPercent1(Math.abs(delta.pct))}% vs. mês anterior`, margin + 7, 76);
    } else {
      setColor(doc, "setTextColor", COLOR.grayLight);
      doc.text("Sem dado do mês anterior para comparar", margin, 76);
    }

    // Meta e premiação (canto direito)
    setColor(doc, "setTextColor", COLOR.gray);
    doc.setFontSize(10);
    const metaLabel = ind.metaDirection === "min" ? `Meta: até ${formatValue(ind.unit, ind.meta)}` : `Meta: mín. ${formatValue(ind.unit, ind.meta)}`;
    doc.text(metaLabel, pageWidth - margin - doc.getTextWidth(metaLabel), 42);
    if (ind.status === "batida" && ind.premio > 0) {
      setColor(doc, "setTextColor", COLOR.warning);
      doc.setFont("helvetica", "bold");
      const premioLabel = `Premiação: ${formatValue("currency", ind.premio)}`;
      doc.text(premioLabel, pageWidth - margin - doc.getTextWidth(premioLabel), 49);
    }

    // Gráfico de colunas grande: mês atual x mês anterior
    const chartTop = 90;
    const chartBottom = pageHeight - 40;
    const chartH = chartBottom - chartTop;
    const chartAreaW = pageWidth - margin * 2;
    const colW = 46;
    const gapBetween = 30;
    const totalColsW = colW * 2 + gapBetween;
    const chartLeft = margin + (chartAreaW - totalColsW) / 2;

    const maxVal = Math.max(ind.valorAtual ?? 0, ind.valorAnterior ?? 0, ind.meta, 0.0001) * 1.15;

    // linha de base
    setColor(doc, "setDrawColor", COLOR.border);
    doc.line(margin, chartBottom, pageWidth - margin, chartBottom);

    // linha de meta (tracejada)
    const metaY = chartBottom - (ind.meta / maxVal) * chartH;
    doc.setLineDashPattern([2, 1.5], 0);
    setColor(doc, "setDrawColor", COLOR.grayLight);
    doc.line(margin, metaY, pageWidth - margin, metaY);
    doc.setLineDashPattern([], 0);
    setColor(doc, "setTextColor", COLOR.grayLight);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.text(`Meta: ${formatValue(ind.unit, ind.meta)}`, pageWidth - margin - doc.getTextWidth(`Meta: ${formatValue(ind.unit, ind.meta)}`), metaY - 1.5);

    const columns: { x: number; value: number | null; color: readonly [number, number, number]; monthLabel: string }[] = [
      { x: chartLeft, value: ind.valorAtual, color: ind.color, monthLabel: periodoAtualShort },
      {
        x: chartLeft + colW + gapBetween,
        value: ind.valorAnterior,
        color: COLOR.border,
        monthLabel: periodoAnteriorShort ?? "-",
      },
    ];

    for (const col of columns) {
      const h = col.value !== null ? Math.max((col.value / maxVal) * chartH, 2) : 0;
      const barY = chartBottom - h;
      setColor(doc, "setFillColor", col.value === null ? COLOR.panel : col.color);
      doc.roundedRect(col.x, barY, colW, h, 2, 2, "F");

      // valor acima da coluna
      setColor(doc, "setTextColor", COLOR.dark);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(13);
      const valueText = formatValue(ind.unit, col.value);
      doc.text(valueText, col.x + colW / 2 - doc.getTextWidth(valueText) / 2, barY - 4);

      // nome do mês em destaque abaixo da coluna
      setColor(doc, "setTextColor", COLOR.dark);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(13);
      doc.text(col.monthLabel, col.x + colW / 2 - doc.getTextWidth(col.monthLabel) / 2, chartBottom + 9);
    }

    drawFooter(doc, pageWidth, pageHeight, margin);
  });

  // Página de resumo
  doc.addPage();
  drawHeader(doc, pageWidth, margin, "Reunião Cozinha", empresaName, periodoLabel);

  setColor(doc, "setTextColor", COLOR.dark);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("Resumo do mês", margin, 42);

  setColor(doc, "setFillColor", COLOR.warning);
  doc.roundedRect(margin, 48, pageWidth - margin * 2, 16, 2, 2, "F");
  setColor(doc, "setTextColor", COLOR.white);
  doc.setFontSize(13);
  doc.text(`Premiação total do mês: ${formatValue("currency", premiacaoTotal)}`, pageWidth / 2, 58, { align: "center" });

  // tabela resumo por indicador
  let rowY = 76;
  setColor(doc, "setTextColor", COLOR.gray);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("Indicador", margin, rowY);
  doc.text("Atual", margin + 60, rowY);
  doc.text("Anterior", margin + 90, rowY);
  doc.text("Meta", margin + 122, rowY);
  doc.text("Status", margin + 152, rowY);
  rowY += 3;
  setColor(doc, "setDrawColor", COLOR.border);
  doc.line(margin, rowY, pageWidth - margin, rowY);
  rowY += 6;

  for (const ind of indicators) {
    setColor(doc, "setFillColor", ind.color);
    doc.circle(margin + 1.5, rowY - 1.5, 1.5, "F");
    setColor(doc, "setTextColor", COLOR.dark);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    doc.text(ind.label, margin + 5, rowY);
    doc.text(formatValue(ind.unit, ind.valorAtual), margin + 60, rowY);
    doc.text(formatValue(ind.unit, ind.valorAnterior), margin + 90, rowY);
    doc.text(formatValue(ind.unit, ind.meta), margin + 122, rowY);
    const st = statusStyle(ind.status);
    setColor(doc, "setTextColor", st.color);
    doc.text(st.label, margin + 152, rowY);
    rowY += 9;
  }

  rowY += 6;
  setColor(doc, "setTextColor", COLOR.dark);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("Observações da reunião", margin, rowY);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  setColor(doc, "setTextColor", COLOR.gray);
  const obsLines = doc.splitTextToSize(observacoes || "Sem observações registradas.", pageWidth - margin * 2);
  doc.text(obsLines, margin, rowY + 7);

  drawFooter(doc, pageWidth, pageHeight, margin);

  doc.save(`reuniao-cozinha-${periodoLabel.replace(/\s+/g, "-").toLowerCase()}.pdf`);
}
