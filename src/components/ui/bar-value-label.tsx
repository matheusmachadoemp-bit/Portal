/**
 * Rótulos de valor sempre visíveis para gráficos de barra do Recharts —
 * "configuração padrão" do portal: todo gráfico de barra mostra o valor de
 * cada barra, não só ao passar o mouse. Duas variantes, para as duas
 * orientações de `<BarChart>` usadas no portal:
 *
 * - `makeBarValueLabel`: barras horizontais (`layout="vertical"`, categoria
 *   no eixo Y). Em barras longas o texto fica dentro da barra, alinhado à
 *   direita, em branco. Em barras curtas (onde o texto não caberia dentro
 *   da área colorida) o rótulo "vaza" para fora, logo à direita da barra.
 * - `makeColumnValueLabel`: barras verticais/colunas (layout padrão,
 *   categoria no eixo X, barra cresce de baixo pra cima). O texto fica
 *   sempre acima da coluna, na cor do texto secundário do tema.
 *
 * Mesmo comportamento de `renderPercentBarLabel`
 * (@/components/ui/percent-bar-label), só que genérico: recebem um
 * formatador (`formatCurrency`, `formatNumber`, etc.) em vez de fixar o
 * sufixo "%".
 */

const MIN_WIDTH_FOR_INSIDE_LABEL = 40;

type BarValueLabelProps = {
  x?: number | string;
  y?: number | string;
  width?: number | string;
  height?: number | string;
  value?: number | string | boolean | null;
};

export function makeBarValueLabel(formatter: (value: number) => string) {
  return function BarValueLabel(props: BarValueLabelProps) {
    const x = Number(props.x ?? 0);
    const y = Number(props.y ?? 0);
    const width = Number(props.width ?? 0);
    const height = Number(props.height ?? 0);
    const value = props.value;

    if (value === undefined || value === null || value === "" || typeof value === "boolean") return null;

    const fitsInside = width >= MIN_WIDTH_FOR_INSIDE_LABEL;
    const textX = fitsInside ? x + width - 6 : x + width + 6;
    const textAnchor = fitsInside ? "end" : "start";

    return (
      <text x={textX} y={y + height / 2} dy={4} textAnchor={textAnchor} fill="#fff" fontSize={11}>
        {formatter(Number(value))}
      </text>
    );
  };
}

export function makeColumnValueLabel(formatter: (value: number) => string) {
  return function ColumnValueLabel(props: BarValueLabelProps) {
    const x = Number(props.x ?? 0);
    const y = Number(props.y ?? 0);
    const width = Number(props.width ?? 0);
    const value = props.value;

    if (value === undefined || value === null || value === "" || typeof value === "boolean") return null;

    return (
      <text x={x + width / 2} y={y - 6} textAnchor="middle" fill="var(--nord-gray)" fontSize={11}>
        {formatter(Number(value))}
      </text>
    );
  };
}
