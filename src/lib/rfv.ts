export type RfvSegment =
  | "Campeões"
  | "Clientes fiéis"
  | "Grandes compradores"
  | "Potenciais fiéis"
  | "Clientes novos"
  | "Clientes promissores"
  | "Precisam de atenção"
  | "Em risco"
  | "Hibernando"
  | "Perdidos";

export const RFV_SEGMENTS: RfvSegment[] = [
  "Campeões",
  "Clientes fiéis",
  "Grandes compradores",
  "Potenciais fiéis",
  "Clientes novos",
  "Clientes promissores",
  "Precisam de atenção",
  "Em risco",
  "Hibernando",
  "Perdidos",
];

export const RFV_SEGMENT_TONE: Record<RfvSegment, "default" | "success" | "warning" | "danger" | "info"> = {
  Campeões: "success",
  "Clientes fiéis": "success",
  "Grandes compradores": "info",
  "Potenciais fiéis": "info",
  "Clientes novos": "info",
  "Clientes promissores": "default",
  "Precisam de atenção": "warning",
  "Em risco": "warning",
  Hibernando: "danger",
  Perdidos: "danger",
};

export type ClienteRfvInput = { clienteId: string; diasDesdeUltimaCompra: number; frequencia: number; valor: number };

/** Converte um valor em score 1-5 pela posição relativa (percentil) dentro do conjunto — funciona com qualquer N. */
function percentileScore(value: number, sorted: number[], invert = false): number {
  if (sorted.length <= 1) return 3;
  const rank = sorted.filter((v) => v <= value).length / sorted.length;
  const score = Math.ceil(rank * 5) || 1;
  return invert ? 6 - score : score;
}

/**
 * Classifica o cliente em um segmento RFV a partir dos scores R/F/V (1-5).
 * As regras seguem a heurística usual de segmentação RFM/RFV — não existe
 * um limite "oficial" único; o objetivo é dar ao gestor uma leitura útil,
 * não uma verdade estatística absoluta.
 */
export function classifySegment(r: number, f: number, v: number): RfvSegment {
  if (r <= 1 && f <= 1 && v <= 2) return "Perdidos";
  if (r <= 2 && f >= 4 && v >= 4) return "Em risco";
  if (r <= 2 && f <= 2) return "Hibernando";
  if (r >= 4 && f >= 4 && v >= 4) return "Campeões";
  if (f >= 4 && v >= 3) return "Clientes fiéis";
  if (v >= 4) return "Grandes compradores";
  if (r >= 4 && f <= 1) return "Clientes novos";
  if (r >= 4 && f >= 2) return "Potenciais fiéis";
  if (r >= 3) return "Clientes promissores";
  return "Precisam de atenção";
}

export function computeRfv(
  clientes: ClienteRfvInput[]
): (ClienteRfvInput & { scoreR: number; scoreF: number; scoreV: number; segmento: RfvSegment })[] {
  const recencias = clientes.map((c) => c.diasDesdeUltimaCompra).sort((a, b) => a - b);
  const frequencias = clientes.map((c) => c.frequencia).sort((a, b) => a - b);
  const valores = clientes.map((c) => c.valor).sort((a, b) => a - b);

  return clientes.map((c) => {
    const scoreR = percentileScore(c.diasDesdeUltimaCompra, recencias, true);
    const scoreF = percentileScore(c.frequencia, frequencias);
    const scoreV = percentileScore(c.valor, valores);
    return { ...c, scoreR, scoreF, scoreV, segmento: classifySegment(scoreR, scoreF, scoreV) };
  });
}
