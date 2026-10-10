/**
 * Regras PURAS do código de identificação do produto (sem banco): prefixo por categoria e
 * numeração. O acesso ao banco (checar existência, gravar com retry) fica em `ficha-code.ts`.
 */
import type { ProductCategory } from "@prisma/client";

/** Prefixo padrão por categoria — o mesmo padrão dos produtos já cadastrados (PZ-001, BG-001, SK-001). `Record<ProductCategory, ...>` obriga a escolher um prefixo ao criar uma categoria nova no enum. */
export const DEFAULT_PREFIX_BY_CATEGORY: Record<ProductCategory, string> = {
  PIZZA_SALGADA: "PZ",
  PIZZA_DOCE: "PZ",
  COMBO: "CB",
  ESFIHA_SALGADA: "EF",
  ESFIHA_DOCE: "EF",
  ACOMPANHAMENTO: "AC",
  BURGER: "BG",
  BEBIDA: "BB",
  DRINK: "DR",
  SOBREMESA: "SB",
  // Cardápio da Zarki Sushi (tipo de prato e modalidade de venda) compartilham o prefixo "SK",
  // o mesmo dos produtos SK-001/SK-002 que já existem.
  SUSHI: "SK",
  SASHIMI: "SK",
  TEMAKI: "SK",
  URAMAKI: "SK",
  HOT_ROLL: "SK",
  ENTRADA: "SK",
  DELIVERY: "SK",
  LA_CARTE: "SK",
  RODIZIO: "SK",
};

export function isProductCategory(value: unknown): value is ProductCategory {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(DEFAULT_PREFIX_BY_CATEGORY, value);
}

export function productCodePrefix(category: string): string {
  return isProductCategory(category) ? DEFAULT_PREFIX_BY_CATEGORY[category] : "PR";
}

/**
 * Prefixo a usar: se os produtos JÁ cadastrados naquela categoria seguem um padrão `LETRAS-NÚMERO`,
 * continua com o mais comum entre eles (assim a numeração não "bifurca" em duas séries quando o
 * catálogo antigo usa outro prefixo); sem histórico, usa o padrão da categoria.
 */
export function learnPrefix(category: string, existingCodesOfCategory: string[]): string {
  const counts = new Map<string, number>();
  for (const code of existingCodesOfCategory) {
    const m = /^([A-Za-z]{1,6})-\d+$/.exec(code.trim());
    if (m) counts.set(m[1].toUpperCase(), (counts.get(m[1].toUpperCase()) ?? 0) + 1);
  }
  let best: string | null = null;
  let bestCount = 0;
  for (const [prefix, count] of counts) {
    if (count > bestCount) {
      best = prefix;
      bestCount = count;
    }
  }
  return best ?? productCodePrefix(category);
}

export function formatProductCode(prefix: string, n: number): string {
  return `${prefix}-${String(n).padStart(3, "0")}`;
}

/** Próximo número livre do prefixo, olhando só os códigos no padrão `PREFIXO-NNN` (maior + 1). */
export function nextCodeNumber(prefix: string, existingCodes: string[]): number {
  const re = new RegExp(`^${prefix}-(\\d+)$`, "i");
  let max = 0;
  for (const code of existingCodes) {
    const m = re.exec(code.trim());
    if (m) max = Math.max(max, Number(m[1]));
  }
  return max + 1;
}
