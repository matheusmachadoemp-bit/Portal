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
