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

export function exportCozinhaMeetingPdf(params: {
  empresaName: string;
  periodoLabel: string;
  periodoAnteriorLabel: string | null;
  indicators: MeetingIndicator[];
  premiacaoTotal: number;
  observacoes: string;
}) {
  const { empresaName, periodoLabel, periodoAnteriorLabel, indicators, premiacaoTotal, observacoes } = params;
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 12;

  // Cabeçalho
  setColor(doc, "setFillColor", COLOR.blue);
  doc.rect(0, 0, pageWidth, 28, "F");
  setColor(doc, "setTextColor", COLOR.white);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text("Reunião Cozinha", margin, 14);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(`${empresaName} · Fechamento de ${periodoLabel}`, margin, 21);
  doc.text(
    periodoAnteriorLabel ? `Comparado com ${periodoAnteriorLabel}` : "Sem dado do mês anterior para comparação",
    margin,
    26
  );

  // Cards 2x2
  const gap = 6;
  const cardW = (pageWidth - margin * 2 - gap) / 2;
  const cardH = 42;
  const y = 36;

  indicators.forEach((ind, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = margin + col * (cardW + gap);
    const cardY = y + row * (cardH + gap);

    // fundo do card
    setColor(doc, "setFillColor", COLOR.panel);
    doc.roundedRect(x, cardY, cardW, cardH, 2, 2, "F");
    // barra colorida no topo
    setColor(doc, "setFillColor", ind.color);
    doc.roundedRect(x, cardY, cardW, 1.6, 0.8, 0.8, "F");

    setColor(doc, "setTextColor", COLOR.dark);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text(ind.label, x + 4, cardY + 8);

    // selo de status
    const st = statusStyle(ind.status);
    doc.setFontSize(8);
    const badgeW = doc.getTextWidth(st.label) + 6;
    const badgeX = x + cardW - badgeW - 3;
    setColor(doc, "setFillColor", st.color);
    doc.roundedRect(badgeX, cardY + 4, badgeW, 5.5, 2.5, 2.5, "F");
    setColor(doc, "setTextColor", COLOR.white);
    doc.setFont("helvetica", "normal");
    doc.text(st.label, badgeX + 3, cardY + 7.8);

    // valor atual
    setColor(doc, "setTextColor", COLOR.dark);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text(formatValue(ind.unit, ind.valorAtual), x + 4, cardY + 18);

    // variação vs mês anterior
    const delta = deltaInfo(ind);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    if (delta) {
      const deltaColor = delta.melhorou ? COLOR.success : COLOR.danger;
      setColor(doc, "setFillColor", deltaColor);
      const triY = cardY + 21.3;
      if (delta.pct >= 0) {
        doc.triangle(x + 4, triY + 1.6, x + 6.2, triY + 1.6, x + 5.1, triY - 0.6, "F");
      } else {
        doc.triangle(x + 4, triY - 0.6, x + 6.2, triY - 0.6, x + 5.1, triY + 1.6, "F");
      }
      setColor(doc, "setTextColor", deltaColor);
      doc.text(`${formatPercent1(Math.abs(delta.pct))}% vs. mês anterior`, x + 8, cardY + 23.5);
    } else {
      setColor(doc, "setTextColor", COLOR.grayLight);
      doc.text("Sem comparativo", x + 4, cardY + 23.5);
    }

    // mini-gráfico de barras: atual x anterior
    const chartX = x + 4;
    const chartY = cardY + 27;
    const chartW = cardW - 8;
    const barAreaH = 10;
    const maxVal = Math.max(ind.valorAtual ?? 0, ind.valorAnterior ?? 0, ind.meta, 0.0001);
    const barW = (chartW - 4) / 2;

    const atualH = ind.valorAtual !== null ? Math.max((ind.valorAtual / maxVal) * barAreaH, 1) : 0;
    const anteriorH = ind.valorAnterior !== null ? Math.max((ind.valorAnterior / maxVal) * barAreaH, 1) : 0;

    setColor(doc, "setFillColor", ind.color);
    doc.rect(chartX, chartY + (barAreaH - atualH), barW, atualH, "F");
    setColor(doc, "setFillColor", COLOR.border);
    doc.rect(chartX + barW + 4, chartY + (barAreaH - anteriorH), barW, anteriorH, "F");

    setColor(doc, "setTextColor", COLOR.gray);
    doc.setFontSize(6.5);
    doc.text("Atual", chartX, chartY + barAreaH + 3.5);
    doc.text("Anterior", chartX + barW + 4, chartY + barAreaH + 3.5);

    // meta e premiação
    setColor(doc, "setTextColor", COLOR.gray);
    doc.setFontSize(7.5);
    const metaLabel = ind.metaDirection === "min" ? `Meta: até ${formatValue(ind.unit, ind.meta)}` : `Meta: mín. ${formatValue(ind.unit, ind.meta)}`;
    doc.text(metaLabel, chartX + chartW - doc.getTextWidth(metaLabel), chartY + 3);
    if (ind.status === "batida" && ind.premio > 0) {
      setColor(doc, "setTextColor", COLOR.warning);
      const premioLabel = `Premiação: ${formatValue("currency", ind.premio)}`;
      doc.text(premioLabel, chartX + chartW - doc.getTextWidth(premioLabel), chartY + 8);
    }
  });

  const gridBottom = y + Math.ceil(indicators.length / 2) * (cardH + gap);

  // Faixa de premiação total
  const bannerY = gridBottom + 2;
  setColor(doc, "setFillColor", COLOR.warning);
  doc.roundedRect(margin, bannerY, pageWidth - margin * 2, 14, 2, 2, "F");
  setColor(doc, "setTextColor", COLOR.white);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(
    `Premiação total do mês: ${formatValue("currency", premiacaoTotal)}`,
    margin + (pageWidth - margin * 2) / 2,
    bannerY + 9,
    { align: "center" }
  );

  // Observações
  const obsY = bannerY + 20;
  setColor(doc, "setTextColor", COLOR.dark);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("Observações da reunião", margin, obsY);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  setColor(doc, "setTextColor", COLOR.gray);
  const obsLines = doc.splitTextToSize(observacoes || "Sem observações registradas.", pageWidth - margin * 2);
  doc.text(obsLines, margin, obsY + 6);

  // Rodapé
  const pageHeight = doc.internal.pageSize.getHeight();
  setColor(doc, "setDrawColor", COLOR.border);
  doc.line(margin, pageHeight - 14, pageWidth - margin, pageHeight - 14);
  setColor(doc, "setTextColor", COLOR.grayLight);
  doc.setFontSize(7.5);
  doc.text(`Gerado em ${new Date().toLocaleString("pt-BR")} pelo Portal Nord`, margin, pageHeight - 9);

  doc.save(`reuniao-cozinha-${periodoLabel.replace(/\s+/g, "-").toLowerCase()}.pdf`);
}
