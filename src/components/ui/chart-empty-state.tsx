/**
 * Estado vazio para gráficos (recharts) quando não há nenhum dado real
 * no período selecionado.
 *
 * Sem isso, o recharts ainda desenha eixos com uma escala mínima
 * artificial quando todos os valores são 0 (ou o array de dados está
 * vazio) — por exemplo um eixo Y mostrando "0.001k", que parece um dado
 * real mas é só um artefato da biblioteca de gráfico. Use
 * `isChartDataEmpty` para detectar esse caso e renderizar
 * `<ChartEmptyState />` no lugar do `<ResponsiveContainer>`.
 */
export function ChartEmptyState({
  height = 260,
  message = "Sem dados no período selecionado",
}: {
  height?: number;
  message?: string;
}) {
  return (
    <div
      style={{ height }}
      className="flex items-center justify-center text-sm text-nord-gray"
    >
      {message}
    </div>
  );
}

/**
 * Retorna `true` quando um conjunto de dados de gráfico não tem nenhum
 * valor real pra mostrar: array vazio/nulo, ou todas as linhas com 0 (ou
 * ausente) em todas as chaves numéricas informadas.
 */
export function isChartDataEmpty<T extends Record<string, unknown>>(
  data: T[] | null | undefined,
  keys: (keyof T)[]
): boolean {
  if (!data || data.length === 0) return true;
  return data.every((row) =>
    keys.every((key) => {
      const value = row[key];
      return typeof value !== "number" || value === 0;
    })
  );
}
