/**
 * Rótulo de percentual sempre visível para barras horizontais do Recharts
 * (`<BarChart layout="vertical">`). Usado como `content` de um `<LabelList>`
 * dentro do `<Bar>`.
 *
 * Em barras longas o texto fica dentro da barra, alinhado à direita, em
 * branco. Em barras curtas (onde o texto não caberia dentro da área azul)
 * o rótulo "vaza" para fora, logo à direita da barra — como o fundo do
 * card também é escuro, o texto branco continua legível nos dois casos.
 */

const MIN_WIDTH_FOR_INSIDE_LABEL = 28;

type PercentBarLabelProps = {
  x?: number | string;
  y?: number | string;
  width?: number | string;
  height?: number | string;
  value?: number | string | boolean | null;
};

export function renderPercentBarLabel(props: PercentBarLabelProps) {
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
      {`${value}%`}
    </text>
  );
}
