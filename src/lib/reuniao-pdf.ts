import jsPDF from "jspdf";

// Tema escuro, no estilo dos relatórios de fechamento já usados pela loja.
const COLOR = {
  bg: [10, 13, 20] as const,
  bgPanel: [17, 21, 31] as const,
  white: [255, 255, 255] as const,
  grayLight: [180, 188, 199] as const,
  gray: [120, 129, 143] as const,
  grid: [45, 52, 66] as const,
  gold: [245, 183, 0] as const,
  success: [34, 197, 94] as const,
  warning: [245, 158, 11] as const,
  danger: [239, 68, 68] as const,
  blue: [20, 100, 244] as const,
};

// Paleta rotativa dos meses no gráfico (mais antigo -> mais recente).
const MONTH_COLORS: readonly (readonly [number, number, number])[] = [
  [22, 163, 74], // verde
  [34, 211, 238], // ciano
  [245, 183, 0], // dourado (mês atual)
];

type Unit = "percent" | "currency" | "minutes" | "quantity";
type Status = "batida" | "abaixo" | "sem-dado";
type MetaDirection = "max" | "min";

export type MeetingIndicator = {
  key: string;
  label: string;
  unit: Unit;
  meta: number;
  metaDirection: MetaDirection;
  status: Status;
  premio: number;
  /** Do mais antigo para o mais recente (até 3 meses); o último é sempre o mês selecionado. */
  historico: { monthLabel: string; value: number | null }[];
};

function formatValue(unit: Unit, value: number | null) {
  if (value === null) return "-";
  if (unit === "percent") return `${value.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
  if (unit === "minutes") return `${value.toLocaleString("pt-BR", { maximumFractionDigits: 0 })} min`;
  if (unit === "quantity") return `${value.toLocaleString("pt-BR", { maximumFractionDigits: 0 })} un.`;
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function setColor(doc: jsPDF, method: "setFillColor" | "setDrawColor" | "setTextColor", color: readonly [number, number, number]) {
  doc[method](color[0], color[1], color[2]);
}

/** Arredonda para cima num "número redondo" agradável para o eixo do gráfico. */
function niceMax(raw: number) {
  if (raw <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const normalized = raw / magnitude;
  const step = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return step * magnitude;
}

function centeredText(doc: jsPDF, text: string, centerX: number, y: number) {
  doc.text(text, centerX - doc.getTextWidth(text) / 2, y);
}

/** Troféu dourado simplificado, desenhado com formas básicas do jsPDF. */
function drawTrophy(doc: jsPDF, cx: number, cy: number, size: number) {
  setColor(doc, "setFillColor", COLOR.gold);
  const cupW = size * 0.6;
  const cupH = size * 0.5;
  doc.roundedRect(cx - cupW / 2, cy - cupH / 2, cupW, cupH, cupW / 4, cupW / 4, "F");
  doc.circle(cx - cupW / 2 - size * 0.12, cy - cupH / 4, size * 0.14, "F");
  doc.circle(cx + cupW / 2 + size * 0.12, cy - cupH / 4, size * 0.14, "F");
  doc.rect(cx - size * 0.06, cy + cupH / 2 - 1, size * 0.12, size * 0.28, "F");
  doc.triangle(
    cx - size * 0.28,
    cy + cupH / 2 + size * 0.28,
    cx + size * 0.28,
    cy + cupH / 2 + size * 0.28,
    cx,
    cy + cupH / 2 + size * 0.14,
    "F"
  );
  doc.rect(cx - size * 0.32, cy + cupH / 2 + size * 0.26, size * 0.64, size * 0.08, "F");
}

function drawPageBackground(doc: jsPDF, pageWidth: number, pageHeight: number) {
  setColor(doc, "setFillColor", COLOR.bg);
  doc.rect(0, 0, pageWidth, pageHeight, "F");
  // faixa de destaque no rodapé, remetendo à identidade visual da marca
  setColor(doc, "setFillColor", COLOR.blue);
  doc.rect(0, pageHeight - 6, pageWidth, 6, "F");
}

function drawWordmark(doc: jsPDF, x: number, y: number) {
  setColor(doc, "setFillColor", COLOR.blue);
  doc.circle(x + 2, y - 2, 2.6, "F");
  setColor(doc, "setTextColor", COLOR.white);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("NORD", x + 7, y);
}

function messageFor(status: Status) {
  if (status === "batida") return { text: "PARABÉNS! EXCELENTE RESULTADO", color: COLOR.success };
  if (status === "abaixo") return { text: "VAMOS SUPERAR ESSA META NO PRÓXIMO MÊS!", color: COLOR.warning };
  return { text: "AINDA SEM DADOS PARA ESSE INDICADOR", color: COLOR.grayLight };
}

export function exportMeetingReportPdf(params: {
  fileSlug: string;
  empresaName: string;
  periodoLabel: string;
  indicators: MeetingIndicator[];
  premiacaoTotal: number;
  observacoes: string;
}) {
  const { fileSlug, empresaName, periodoLabel, indicators, premiacaoTotal, observacoes } = params;
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 16;
  const centerX = pageWidth / 2;

  indicators.forEach((ind, i) => {
    if (i > 0) doc.addPage();
    drawPageBackground(doc, pageWidth, pageHeight);
    drawWordmark(doc, margin, 16);

    // Título
    setColor(doc, "setTextColor", COLOR.white);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(30);
    centeredText(doc, ind.label.toUpperCase(), centerX, 38);

    const metaLabel = ind.metaDirection === "min" ? `META: ATÉ ${formatValue(ind.unit, ind.meta).toUpperCase()}` : `META: MÍN. ${formatValue(ind.unit, ind.meta).toUpperCase()}`;
    setColor(doc, "setTextColor", COLOR.grayLight);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(12);
    centeredText(doc, metaLabel, centerX, 47);

    const currentStatus = ind.status;
    if (currentStatus === "batida") drawTrophy(doc, pageWidth - margin - 12, 24, 16);

    // Legenda dos meses
    const historico = ind.historico.slice(-3);
    const legendY = 62;
    const legendGap = 42;
    const legendStartX = centerX - ((historico.length - 1) * legendGap) / 2;
    const colors = MONTH_COLORS.slice(MONTH_COLORS.length - historico.length);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    historico.forEach((h, idx) => {
      const lx = legendStartX + idx * legendGap;
      setColor(doc, "setFillColor", colors[idx]);
      doc.circle(lx - 3, legendY - 1.2, 1.8, "F");
      setColor(doc, "setTextColor", COLOR.white);
      doc.text(h.monthLabel.toUpperCase(), lx + 1, legendY);
    });

    // Área do gráfico
    const chartLeft = margin + 12;
    const chartRight = pageWidth - margin - 4;
    const chartBottom = pageHeight - 62;
    const chartTop = 78;
    const chartH = chartBottom - chartTop;
    const chartW = chartRight - chartLeft;

    const maxRaw = Math.max(ind.meta, ...historico.map((h) => h.value ?? 0));
    const axisMax = niceMax(maxRaw * 1.15);
    const steps = 6;

    setColor(doc, "setDrawColor", COLOR.grid);
    setColor(doc, "setTextColor", COLOR.gray);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    for (let s = 0; s <= steps; s++) {
      const val = (axisMax / steps) * s;
      const gy = chartBottom - (val / axisMax) * chartH;
      doc.line(chartLeft, gy, chartRight, gy);
      const label = val.toFixed(0);
      doc.text(label, chartLeft - 3 - doc.getTextWidth(label), gy + 1.2);
    }

    // linha de meta
    const metaY = chartBottom - (ind.meta / axisMax) * chartH;
    doc.setLineDashPattern([2, 1.5], 0);
    setColor(doc, "setDrawColor", COLOR.gold);
    doc.line(chartLeft, metaY, chartRight, metaY);
    doc.setLineDashPattern([], 0);

    // barras
    const barCount = historico.length;
    const barGap = 14;
    const barW = Math.min(34, (chartW - barGap * (barCount - 1)) / barCount - 6);
    const groupW = barW * barCount + barGap * (barCount - 1);
    const groupStart = chartLeft + (chartW - groupW) / 2;

    historico.forEach((point, idx) => {
      const bx = groupStart + idx * (barW + barGap);
      const val = point.value ?? 0;
      const barHeight = point.value !== null ? Math.max((val / axisMax) * chartH, 1.5) : 0;
      const by = chartBottom - barHeight;
      setColor(doc, "setFillColor", point.value === null ? COLOR.grid : colors[idx]);
      doc.roundedRect(bx, by, barW, barHeight, 1.5, 1.5, "F");

      setColor(doc, "setTextColor", COLOR.white);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      const valueText = formatValue(ind.unit, point.value);
      centeredText(doc, valueText, bx + barW / 2, by - 3);
    });

    setColor(doc, "setDrawColor", COLOR.grayLight);
    doc.line(chartLeft, chartBottom, chartRight, chartBottom);

    // faixa de mensagem
    const msg = messageFor(currentStatus);
    setColor(doc, "setTextColor", msg.color);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(15);
    centeredText(doc, msg.text, centerX, pageHeight - 38);

    if (currentStatus === "batida" && ind.premio > 0) {
      setColor(doc, "setTextColor", COLOR.gold);
      doc.setFontSize(11);
      centeredText(doc, `PREMIAÇÃO: ${formatValue("currency", ind.premio).toUpperCase()}`, centerX, pageHeight - 30);
    }

    setColor(doc, "setTextColor", COLOR.gray);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    centeredText(doc, "FOCO EM RESULTADOS. PAIXÃO EM SERVIR.", centerX, pageHeight - 10);
  });

  // Página final: resumo + observações
  doc.addPage();
  drawPageBackground(doc, pageWidth, pageHeight);
  drawWordmark(doc, margin, 16);

  setColor(doc, "setTextColor", COLOR.white);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(26);
  centeredText(doc, "RESUMO DA REUNIÃO", centerX, 32);
  setColor(doc, "setTextColor", COLOR.grayLight);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  centeredText(doc, `${empresaName} · Fechamento de ${periodoLabel}`, centerX, 40);

  setColor(doc, "setFillColor", COLOR.bgPanel);
  doc.roundedRect(margin, 50, pageWidth - margin * 2, 18, 3, 3, "F");
  setColor(doc, "setTextColor", COLOR.gold);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  centeredText(doc, `PREMIAÇÃO TOTAL DO MÊS: ${formatValue("currency", premiacaoTotal).toUpperCase()}`, centerX, 61);

  let rowY = 84;
  setColor(doc, "setTextColor", COLOR.gray);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("INDICADOR", margin, rowY);
  doc.text("ATUAL", margin + 68, rowY);
  doc.text("META", margin + 108, rowY);
  doc.text("STATUS", margin + 140, rowY);
  rowY += 3;
  setColor(doc, "setDrawColor", COLOR.grid);
  doc.line(margin, rowY, pageWidth - margin, rowY);
  rowY += 8;

  for (const ind of indicators) {
    const atual = ind.historico[ind.historico.length - 1]?.value ?? null;
    setColor(doc, "setFillColor", COLOR.gold);
    doc.circle(margin + 1.5, rowY - 1.5, 1.5, "F");
    setColor(doc, "setTextColor", COLOR.white);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(ind.label, margin + 5, rowY);
    doc.text(formatValue(ind.unit, atual), margin + 68, rowY);
    doc.text(formatValue(ind.unit, ind.meta), margin + 108, rowY);
    const st = messageForStatusShort(ind.status);
    setColor(doc, "setTextColor", st.color);
    doc.text(st.label, margin + 140, rowY);
    rowY += 10;
  }

  rowY += 8;
  setColor(doc, "setTextColor", COLOR.white);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text("OBSERVAÇÕES DA REUNIÃO", margin, rowY);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10.5);
  setColor(doc, "setTextColor", COLOR.grayLight);
  const obsLines = doc.splitTextToSize(observacoes || "Sem observações registradas.", pageWidth - margin * 2);
  doc.text(obsLines, margin, rowY + 8);

  setColor(doc, "setTextColor", COLOR.gray);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  centeredText(doc, "FOCO EM RESULTADOS. PAIXÃO EM SERVIR.", centerX, pageHeight - 10);

  doc.save(`${fileSlug}-${periodoLabel.replace(/\s+/g, "-").toLowerCase()}.pdf`);
}

function messageForStatusShort(status: Status) {
  if (status === "batida") return { label: "Meta batida", color: COLOR.success };
  if (status === "abaixo") return { label: "Abaixo da meta", color: COLOR.warning };
  return { label: "Sem dado", color: COLOR.grayLight };
}
