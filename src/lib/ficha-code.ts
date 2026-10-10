import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { p2002ConstraintIncludes } from "@/lib/prisma-errors";
import { formatProductCode, learnPrefix, nextCodeNumber } from "@/lib/ficha-code-core";

export { formatProductCode, nextCodeNumber, productCodePrefix } from "@/lib/ficha-code-core";

/**
 * Código de identificação do produto da Ficha Técnica, gerado pelo sistema (ninguém digita).
 *
 * Formato `PREFIXO-NNN` — o mesmo que os produtos já cadastrados usam (PZ-001 pizza, BG-001 burger,
 * SK-001 Zarki Sushi). O prefixo vem da categoria do produto; o número é o próximo livre daquele
 * prefixo. `Product.code` é `@unique` no banco inteiro (não por loja), então o número é sequencial
 * entre TODAS as lojas daquele prefixo — nunca se repete.
 *
 * Garantia de não repetir, em duas camadas:
 *  1. Antes de gravar, procura o próximo número e confere no banco se o código já existe; se existir
 *     (ex.: um código digitado à mão no passado, fora da sequência), pula para o seguinte.
 *  2. Se duas pessoas cadastrarem ao mesmo tempo e pegarem o mesmo número, o índice único do banco
 *     recusa a segunda gravação — e o sistema gera outro código e tenta de novo, sozinho.
 */

/**
 * Gera um código livre para a categoria. Confere no banco se o candidato já existe e, se existir,
 * tenta o seguinte. `skip` (usado só na nova tentativa após conflito) pula números já recusados.
 */
export async function generateProductCode(category: string, skip = 0): Promise<string> {
  // Prefixo: o que os produtos da mesma categoria já usam (se seguirem `LETRAS-NÚMERO`) ou o padrão.
  const sameCategory = await prisma.product.findMany({
    where: { category: category as never },
    select: { code: true },
    take: 500,
  });
  const prefix = learnPrefix(category, sameCategory.map((p) => p.code));
  const existing = await prisma.product.findMany({
    where: { code: { startsWith: `${prefix}-`, mode: "insensitive" } },
    select: { code: true },
  });
  let n =
    nextCodeNumber(
      prefix,
      existing.map((p) => p.code)
    ) + skip;

  for (let guard = 0; guard < 200; guard++, n++) {
    const code = formatProductCode(prefix, n);
    const taken = await prisma.product.findFirst({
      where: { code: { equals: code, mode: "insensitive" } },
      select: { id: true },
    });
    if (!taken) return code;
  }
  throw new Error("Não foi possível gerar um código livre para o produto.");
}

function isCodeConflict(e: unknown): boolean {
  return (
    e instanceof Prisma.PrismaClientKnownRequestError &&
    e.code === "P2002" &&
    (p2002ConstraintIncludes(e, "code_key") ?? true)
  );
}

/**
 * Gera o código e grava o produto (`create` recebe o código). Se outra gravação simultânea levou o
 * mesmo código (conflito no índice único), gera um novo e tenta de novo — o usuário nunca vê erro
 * de "código já em uso".
 */
export async function createWithAutoCode<T>(category: string, create: (code: string) => Promise<T>): Promise<T> {
  const attempts = 8;
  for (let attempt = 0; attempt < attempts; attempt++) {
    const code = await generateProductCode(category, attempt === 0 ? 0 : Math.floor(Math.random() * 3 * attempt));
    try {
      return await create(code);
    } catch (e) {
      if (!isCodeConflict(e) || attempt === attempts - 1) throw e;
    }
  }
  throw new Error("Não foi possível gerar um código livre para o produto.");
}
