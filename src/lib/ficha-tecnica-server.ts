import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type ExcluirIngredientResultado = { deletado: true } | { deletado: false; motivo: string };

/**
 * Tenta excluir um `Ingredient` (insumo/produto — model compartilhado por duas telas: Estoque >
 * Produtos, `src/app/portal/estoque/produtos/produtos-client.tsx`, e a aba "Insumos" da Ficha
 * Técnica, `src/app/portal/ficha-tecnica/[sub]/insumos-client.tsx`).
 *
 * Usada tanto por `DELETE /api/ficha-tecnica/insumos/[id]` (exclusão individual) quanto por
 * `POST /api/ficha-tecnica/insumos/excluir-lote` (exclusão em lote) — mesma regra de bloqueio nos
 * dois lugares, sem duplicar a lista de relacionamentos que tornam um insumo "em uso".
 *
 * IMPORTANTE: quem chama esta função já deve ter confirmado, antes, autenticação, permissão
 * (`canDelete` do módulo "ficha-tecnica") e acesso à empresa dona do insumo
 * (`assertEmpresaAccess`) — esta função só cuida da regra de "está em uso, não pode excluir".
 *
 * Duas camadas de checagem, nessa ordem (motivo de cada uma documentado a fundo aqui porque já
 * causou 2 bugs reais no passado — ver commits "Corrige exclusão de Insumo que não fazia nada
 * (Ficha Técnica)" e "Corrige exclusão de Insumo que apagava histórico de StockMovement"):
 *
 * 1. `ProductionItem.ingredientId` usa `onDelete: SetNull` (relação opcional: um insumo pode ser
 *    a saída de um item de produção, mas não precisa ser). O Prisma NÃO lança nenhum erro ao
 *    excluir um insumo referenciado assim — só apaga o vínculo silenciosamente, órfão o item de
 *    produção (que perde o insumo de saída que ele gera em estoque). Como isso nunca vira um erro
 *    de banco pra gente pegar num catch, esse caso precisa ser checado explicitamente ANTES de
 *    tentar excluir.
 * 2. Todas as demais relações de `Ingredient` — `ProductIngredient` (ficha técnica de produto),
 *    `ProductionItemIngredient` (ficha técnica de item de produção), `PurchaseItem` (compras),
 *    `Loss` (perdas), `TransferItem` (transferências entre lojas), `StockCountItem` (contagens) e
 *    `StockMovement` (movimentações de estoque) — usam `onDelete: Restrict`. `StockMovement` usava
 *    `Cascade` até o achado acima (um insumo sem ficha técnica mas com movimentação de estoque,
 *    ex. "Coca Cola Lata", excluía com 200 OK e apagava esse histórico em cascata, silenciosamente).
 *    Deixamos o Postgres/Prisma recusar a exclusão via erro `P2003` em vez de duplicar a lista de
 *    tabelas aqui "na mão": qualquer relação `Restrict` nova que apareça no schema no futuro já
 *    fica coberta automaticamente, sem precisar lembrar de atualizar esta função.
 *
 * `IngredientPriceHistory` (histórico de preço do próprio insumo) é a única relação com
 * `onDelete: Cascade` que continua correta como cascade: é dado que pertence exclusivamente ao
 * ciclo de vida do próprio insumo, não um "uso" por outra parte do sistema.
 */
export async function excluirIngredientSeNaoEmUso(id: string, nome: string): Promise<ExcluirIngredientResultado> {
  const producesItems = await prisma.productionItem.findMany({
    where: { ingredientId: id },
    select: { name: true },
  });
  if (producesItems.length) {
    return {
      deletado: false,
      motivo: `Não é possível excluir "${nome}" porque ele é o insumo de saída do(s) item(ns) de produção: ${producesItems
        .map((p) => p.name)
        .join(", ")}. Excluir quebraria o vínculo de estoque desses itens. Em vez de excluir, desative o insumo em Estoque > Produtos (desmarque "Ativo").`,
    };
  }

  try {
    await prisma.ingredient.delete({ where: { id } });
    return { deletado: true };
  } catch (e) {
    // As relações Restrict listadas acima fazem o Prisma lançar `PrismaClientKnownRequestError`
    // código P2003 (mesma classe de erro já tratada para exclusão de usuário, achado #192). Sem
    // esse catch a rota devolvia 500 cru e, como a tela não conferia `res.ok`, a exclusão "não
    // acontecia nada" silenciosamente.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2003") {
      const [products, producedByItems] = await Promise.all([
        prisma.product.findMany({
          where: { ingredients: { some: { ingredientId: id } } },
          select: { name: true },
        }),
        prisma.productionItem.findMany({
          where: { ingredientes: { some: { ingredientId: id } } },
          select: { name: true },
        }),
      ]);
      const usedBy = [...products.map((p) => p.name), ...producedByItems.map((p) => p.name)];
      const detail = usedBy.length
        ? ` Ele está sendo usado em: ${usedBy.join(", ")}.`
        : " Ele já tem movimentações registradas no sistema (compras, perdas, transferências, contagens de estoque ou lançamentos manuais de movimentação).";
      return {
        deletado: false,
        motivo: `Não é possível excluir "${nome}" porque ele está vinculado a outros registros do sistema.${detail} Em vez de excluir, desative o insumo em Estoque > Produtos (desmarque "Ativo") para que ele pare de aparecer em novos cadastros sem perder o histórico.`,
      };
    }
    throw e;
  }
}
