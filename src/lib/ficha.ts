// `ingredientCostPerUnit` mora em `@/lib/estoque` (usada também por valorização de estoque,
// contagens e perdas) — importada e reexportada aqui para quem já importa de `@/lib/ficha`
// continuar funcionando sem mudar o import. Ver o comentário na definição (em `@/lib/estoque`)
// para a fórmula certa e o histórico do bug: custo da Ficha Técnica deflacionado por dividir
// `precoAtual` por `quantidadeEmbalagem` à toa (achado de produção, loja Zarki Sushi, 02/10/2026).
import { ingredientCostPerUnit } from "@/lib/estoque";
export { ingredientCostPerUnit };

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
  SOBREMESA: "Sobremesas",
  // Cardápio da Zarki Sushi — ver enum ProductCategory em prisma/schema.prisma para o
  // raciocínio de cada categoria. Sem essas entradas, um produto de sushi some silenciosamente
  // do gráfico "CMV por categoria" (src/lib/cmv-server.ts, src/app/portal/cmv/page.tsx) — esses
  // dois pontos já filtram categorias sem nenhum produto da loja ativa, então não precisam de
  // nenhum outro ajuste além de ganhar o rótulo aqui.
  SUSHI: "Sushis",
  SASHIMI: "Sashimis",
  TEMAKI: "Temakis",
  URAMAKI: "Uramakis",
  HOT_ROLL: "Hot Rolls",
  ENTRADA: "Entradas",
  // Reorganização do cardápio da Zarki Sushi por MODALIDADE de venda (substitui as 6 categorias
  // de tipo-de-prato acima nas abas/formulário — ver FICHA_TECNICA_SUB_MAP abaixo). Os valores
  // acima continuam com rótulo aqui de propósito: produtos já cadastrados com eles continuam
  // existindo no enum/banco (ver migration ficha_tecnica_modalidade_sushi). Os produtos da Zarki
  // que estavam nelas foram movidos para DELIVERY (migration 20261007000100_ficha_tecnica_zarki_
  // pratos_antigos_para_delivery), então só aparecem no gráfico de CMV por categoria se sobrar
  // algum produto com o valor antigo (ex.: criado por fora).
  DELIVERY: "Delivery",
  LA_CARTE: "À La Carte",
  RODIZIO: "Rodízio",
};

/**
 * Informação de uma aba de produto da Ficha Técnica (slug da URL
 * /portal/ficha-tecnica/{slug} -> categoria de produto + loja dona da aba). Compartilhado entre
 * src/app/portal/ficha-tecnica/page.tsx (redirect da raiz) e .../[sub]/page.tsx (conteúdo da aba
 * e validação de que o slug acessado faz sentido pra loja ativa) — mantenha as keys em sincronia
 * com as subcategorias "ficha-tecnica" em prisma/seed.ts (mesma key na Subcategory).
 */
export type FichaTecnicaSubInfo = {
  category: string;
  label: string;
  /** `Empresa.key` dona desta aba. `undefined` = aba compartilhada, visível não importa a loja
   * ativa (ex.: Combos, Bebidas) — mesmo comportamento de `Subcategory.empresaId: null`. */
  empresaKey?: "nord-pizza" | "zarki-sushi";
};

export const FICHA_TECNICA_SUB_MAP: Record<string, FichaTecnicaSubInfo> = {
  "pizzas-salgadas": { category: "PIZZA_SALGADA", label: "Pizzas Salgadas", empresaKey: "nord-pizza" },
  "pizzas-doces": { category: "PIZZA_DOCE", label: "Pizzas Doces", empresaKey: "nord-pizza" },
  combos: { category: "COMBO", label: "Combos" },
  "esfihas-salgadas": { category: "ESFIHA_SALGADA", label: "Esfihas Salgadas", empresaKey: "nord-pizza" },
  "esfihas-doces": { category: "ESFIHA_DOCE", label: "Esfihas Doces", empresaKey: "nord-pizza" },
  acompanhamentos: { category: "ACOMPANHAMENTO", label: "Acompanhamentos", empresaKey: "nord-pizza" },
  burgers: { category: "BURGER", label: "Burgers", empresaKey: "nord-pizza" },
  bebidas: { category: "BEBIDA", label: "Bebidas" },
  drinks: { category: "DRINK", label: "Drinks" },
  // `empresaKey: "nord-pizza"` — antes era compartilhada entre as duas lojas (sem empresaKey).
  // Deixou de fazer sentido pra Zarki Sushi, que agora organiza o cardápio por modalidade de
  // venda (Delivery/À La Carte/Rodízio, abaixo) em vez de por tipo de prato — uma sobremesa da
  // Zarki passa a entrar na ficha técnica de uma dessas 3 modalidades, igual qualquer outro
  // prato. Não afeta em nada o que a Nord Pizza já tinha.
  sobremesas: { category: "SOBREMESA", label: "Sobremesas", empresaKey: "nord-pizza" },
  // Cardápio da Zarki Sushi por MODALIDADE de venda (substitui as 6 abas por tipo de prato que
  // existiam aqui antes — Entradas/Sashimis/Sushis/Temakis/Uramakis/Hot Rolls — ver enum
  // ProductCategory em prisma/schema.prisma e migration ficha_tecnica_modalidade_sushi). A
  // pedido do Matheus: cada modalidade é um cadastro de produto SEPARADO (o mesmo prato pode ter
  // até 3 fichas técnicas diferentes — uma por modalidade — já que porção/embalagem mudam por
  // canal). Os produtos que a Zarki já tinha nas categorias antigas foram movidos para Delivery
  // pela migration 20261007000100_ficha_tecnica_zarki_pratos_antigos_para_delivery; o Matheus
  // reclassifica cada um entre Delivery / À La Carte / Rodízio pela tela de produto.
  delivery: { category: "DELIVERY", label: "Delivery", empresaKey: "zarki-sushi" },
  "la-carte": { category: "LA_CARTE", label: "À La Carte", empresaKey: "zarki-sushi" },
  rodizio: { category: "RODIZIO", label: "Rodízio", empresaKey: "zarki-sushi" },
};

const FICHA_TECNICA_DEFAULT_SUB = "pizzas-salgadas";

/**
 * Primeira aba de PRODUTO (nunca "insumos", que é comum a qualquer loja e tratada à parte em
 * [sub]/page.tsx) que faz sentido pra loja ativa — usada pelo redirect da raiz de
 * /portal/ficha-tecnica e por [sub]/page.tsx quando alguém acessa por URL uma aba de outra loja.
 * Sem uma loja única ativa (modo Grupo Nord, várias lojas ao mesmo tempo — `empresaKey`
 * undefined), cai no fallback histórico (Pizzas Salgadas): escolher "a loja" seria arbitrário, e
 * o sidebar já mostra a união de todas as abas nesse modo, então dá pra navegar manualmente pra
 * qualquer uma a partir daí.
 */
export function defaultFichaTecnicaSub(empresaKey: string | undefined): string {
  if (!empresaKey) return FICHA_TECNICA_DEFAULT_SUB;
  const found = Object.entries(FICHA_TECNICA_SUB_MAP).find(([, info]) => info.empresaKey === empresaKey);
  return found?.[0] ?? FICHA_TECNICA_DEFAULT_SUB;
}

export type IngredientForCalc = {
  precoAtual: number;
  /** Não entra mais no cálculo de custo (ver `ingredientCostPerUnit`) — mantido aqui só porque
   * todo chamador passa o `Ingredient` inteiro do Prisma, que sempre tem este campo. */
  quantidadeEmbalagem: number;
};

export type ProductIngredientForCalc = {
  quantidadeUsada: number;
  percentualPerda: number;
  ingredient: IngredientForCalc;
};

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
