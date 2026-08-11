export const PRODUCT_CATEGORY_LABEL: Record<string, string> = {
  PIZZA_SALGADA: "Pizzas Salgadas",
  PIZZA_DOCE: "Pizzas Doces",
  COMBO: "Combos",
  ESFIHA_SALGADA: "Esfihas Salgadas",
  ESFIHA_DOCE: "Esfihas Doces",
  ACOMPANHAMENTO: "Acompanhamentos",
  BURGER: "Burgers",
  BEBIDA: "Bebidas",
  DRINK: "Drinks",
};

export type IngredientForCalc = {
  precoAtual: number;
  quantidadeEmbalagem: number;
};

export type ProductIngredientForCalc = {
  quantidadeUsada: number;
  percentualPerda: number;
  ingredient: IngredientForCalc;
};

export function ingredientCostPerUnit(ingredient: IngredientForCalc): number {
  if (!ingredient.quantidadeEmbalagem) return 0;
  return ingredient.precoAtual / ingredient.quantidadeEmbalagem;
}

export function productIngredientCost(pi: ProductIngredientForCalc): number {
  const costPerUnit = ingredientCostPerUnit(pi.ingredient);
  const perdaFactor = 1 + (pi.percentualPerda || 0) / 100;
  return costPerUnit * pi.quantidadeUsada * perdaFactor;
}

export function productTotalCost(ingredients: ProductIngredientForCalc[]): number {
  return ingredients.reduce((acc, pi) => acc + productIngredientCost(pi), 0);
}

export function cmvPercent(totalCost: number, precoVenda: number): number {
  if (!precoVenda) return 0;
  return (totalCost / precoVenda) * 100;
}

export function margemContribuicao(totalCost: number, precoVenda: number): number {
  return precoVenda - totalCost;
}

export function margemBrutaPercent(totalCost: number, precoVenda: number): number {
  if (!precoVenda) return 0;
  return ((precoVenda - totalCost) / precoVenda) * 100;
}

export function precoVendaSugerido(totalCost: number, cmvAlvoPercent: number): number {
  if (!cmvAlvoPercent) return 0;
  return totalCost / (cmvAlvoPercent / 100);
}

/**
 * Reajusta o preço de venda para absorver a taxa da plataforma iFood mantendo
 * a mesma margem líquida da venda direta (preço / (1 - taxa%)).
 */
export function precoIfoodSugerido(precoVenda: number, taxaIfoodPercent: number): number {
  const taxa = taxaIfoodPercent / 100;
  if (taxa >= 1) return 0;
  return precoVenda / (1 - taxa);
}

export function lucroIfoodEstimado(precoIfood: number, totalCost: number, taxaIfoodPercent: number): number {
  const taxa = taxaIfoodPercent / 100;
  return precoIfood * (1 - taxa) - totalCost;
}
