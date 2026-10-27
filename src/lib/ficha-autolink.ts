import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

type TxClient = Prisma.TransactionClient;

/**
 * Compara nomes exatamente do jeito que a tela "Estoque > Produtos" já usa para marcar um Insumo
 * como "Duplicado" (`nameCounts`, src/app/portal/estoque/produtos/produtos-client.tsx): sem
 * diferenciar maiúscula/minúscula e sem espaço nas pontas. De propósito mais simples que
 * `normalizeProductName` (src/lib/ficha-nome.ts, que também tira acento e caractere invisível) —
 * aqui o objetivo é reaproveitar o MESMO critério de "nome igual" já usado entre Insumos, não o
 * critério (mais rígido) de nome único de Produto dentro de uma categoria.
 */
function sameName(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/**
 * Produto de revenda simples (compra pronto, revende sem receita — ex.: lata de refrigerante,
 * cerveja): antes desta função, era preciso cadastrar o item em Estoque > Produtos (`Ingredient`)
 * E TAMBÉM adicionar manualmente esse mesmo item como ingrediente da própria ficha do `Product`,
 * só pra ele virar "ingrediente de si mesmo" e o custo ser calculado (`productTotalCost`,
 * src/lib/ficha.ts). Esta função automatiza esse passo.
 *
 * Se o `Product` ainda não tem NENHUM `ProductIngredient` e existe exatamente um `Ingredient` da
 * MESMA loja com nome igual (comparação acima), cria a ligação com `quantidadeUsada: 1` (1 unidade
 * do insumo — revenda direta, sem receita) e `percentualPerda: 0`. Não faz nada (silenciosamente,
 * do ponto de vista de quem chamou — quem cadastrou continua vendo a ficha sem ingredientes, do
 * jeito que já era antes desta função existir) quando:
 *  - o produto já tem 1+ `ProductIngredient` (manual ou de uma chamada anterior desta mesma
 *    função) — nunca duplica nem sobrescreve uma ficha já preenchida;
 *  - não existe nenhum `Ingredient` da loja com o nome igual;
 *  - existe MAIS DE UM `Ingredient` da loja com o nome igual (cadastro duplicado) — nesse caso não
 *    adivinha qual dos dois é o certo; prefere não ligar a nenhum (pior ligar errado do que não
 *    ligar) e só registra um aviso no log do servidor para alguém revisar o cadastro duplicado.
 *
 * Chamada tanto na criação (`POST /api/ficha-tecnica/produtos`) quanto na edição
 * (`PATCH /api/ficha-tecnica/produtos/[id]`) — ver os dois chamadores para a decisão de QUANDO
 * cada rota chama.
 */
export async function autoLinkResaleIngredient(
  db: TxClient,
  params: { productId: string; productName: string; empresaId: string }
): Promise<void> {
  const { productId, productName, empresaId } = params;
  if (!productName.trim()) return;

  const existingCount = await db.productIngredient.count({ where: { productId } });
  if (existingCount > 0) return;

  const candidates = await db.ingredient.findMany({
    where: { empresaId },
    select: { id: true, name: true },
  });
  const matches = candidates.filter((i) => sameName(i.name, productName));
  if (matches.length === 0) return;
  if (matches.length > 1) {
    console.warn(
      `[ficha-autolink] Produto ${productId} ("${productName}") bate com ${matches.length} insumos da loja ${empresaId} (nome duplicado entre Insumos) — auto-link pulado, cadastro precisa ser revisado manualmente.`
    );
    return;
  }

  await db.productIngredient.create({
    data: {
      productId,
      ingredientId: matches[0].id,
      quantidadeUsada: 1,
      percentualPerda: 0,
      order: 0,
    },
  });
}

// Folga para o banco "acordar" (Neon hiberna) e para quem estiver esperando a trava de outro
// salvamento; mesmo valor de `withUniqueProductName` (src/lib/ficha-nome-server.ts), já testado
// nesse outro caminho — o padrão do Prisma (2s de espera / 5s de duração) é apertado para isso.
const TX_OPTIONS = { maxWait: 10_000, timeout: 15_000 };

/**
 * Mesma lógica de `autoLinkResaleIngredient` acima, mas para quem chama FORA de uma transação já
 * existente — caso do PATCH `/api/ficha-tecnica/produtos/[id]` (a troca de ingredientes daquela
 * rota não roda dentro de uma transação própria). Abre a própria transação com uma trava exclusiva
 * por PRODUTO (`pg_advisory_xact_lock`, mesmo mecanismo de `withUniqueProductName` em
 * `ficha-nome-server.ts`, só que travando por produto em vez de por loja).
 *
 * Sem essa trava, "contar ingredientes → decidir → criar" é um clássico "check-then-act": duas
 * edições do MESMO produto ao mesmo tempo (duplo clique em Salvar, duas abas, retry de rede) podem
 * ambas contar zero ingredientes, ambas decidirem ligar e ambas criarem um `ProductIngredient` para
 * o mesmo Ingredient — como não há índice único em `(productId, ingredientId)`, nada no banco
 * impede isso, e `productTotalCost` (src/lib/ficha.ts) soma as duas linhas, dobrando o custo/CMV
 * calculado silenciosamente. Achado real do Teulis na revisão desta tarefa, reproduzido com duas
 * chamadas concorrentes de PATCH para o mesmo produto. A trava aqui é por produto (não por loja,
 * como a de nome) de propósito: o conflito só pode acontecer entre duas gravações do MESMO produto,
 * nunca entre produtos diferentes da mesma loja, então travar por produto é suficiente e não
 * serializa edições de produtos diferentes sem necessidade.
 */
export async function autoLinkResaleIngredientLocked(params: {
  productId: string;
  productName: string;
  empresaId: string;
}): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`ficha-produto-ingrediente:${params.productId}`}, 0))`;
    await autoLinkResaleIngredient(tx, params);
  }, TX_OPTIONS);
}
