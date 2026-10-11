import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { duplicateProductNameMessage, findProductWithSameName } from "@/lib/ficha-nome";
import { PRODUCT_CATEGORY_LABEL } from "@/lib/ficha";

/** Já existe outro produto com esse nome na loja e categoria (a rota transforma em HTTP 409 com a mensagem). */
export class DuplicateProductNameError extends Error {
  constructor(public readonly existing: { id: string; name: string; code: string }, category?: string) {
    super(duplicateProductNameMessage(existing, category ? PRODUCT_CATEGORY_LABEL[category] : undefined));
    this.name = "DuplicateProductNameError";
  }
}

// Folga para o banco "acordar" (Neon hiberna) e para quem estiver esperando a trava de outro
// salvamento; o padrão do Prisma (2s de espera / 5s de duração) é apertado para isso.
const TX_OPTIONS = { maxWait: 10_000, timeout: 15_000 };

/**
 * Executa `work` (cadastrar, renomear ou mudar de categoria um produto) garantindo que nenhum OUTRO
 * produto da mesma loja E categoria tenha o mesmo nome (sem diferenciar maiúscula/minúscula, acento ou espaço sobrando).
 *
 * "Conferir e depois gravar" sozinho não basta: dois salvamentos quase simultâneos (clique duplo,
 * duas pessoas) conferem ao mesmo tempo, ambos veem "livre" e ambos gravam. Por isso tudo roda numa
 * transação que primeiro pega uma trava do Postgres exclusiva DAQUELA loja
 * (`pg_advisory_xact_lock`, solta sozinha no fim da transação): o segundo salvamento espera o
 * primeiro terminar e então enxerga o produto recém-criado.
 *
 * Não há índice único no banco para o nome porque a base já tem produtos antigos com nome
 * repetido; a trava vale para tudo que passa pelo sistema.
 */
export async function withUniqueProductName<T>(
  empresaId: string,
  category: string,
  name: string,
  excludeProductId: string | null,
  work: (tx: Prisma.TransactionClient) => Promise<T>
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`ficha-produto-nome:${empresaId}`}, 0))`;
    const products = await tx.product.findMany({
      where: { empresaId, category: category as never },
      select: { id: true, name: true, code: true },
      orderBy: { createdAt: "asc" },
    });
    const clash = findProductWithSameName(products, name, excludeProductId);
    if (clash) throw new DuplicateProductNameError(clash, category);
    return work(tx);
  }, TX_OPTIONS);
}
