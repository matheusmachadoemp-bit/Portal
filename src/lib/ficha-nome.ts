/**
 * Regras PURAS (sem banco) para impedir dois produtos com o mesmo nome na mesma loja.
 * O acesso ao banco (trava contra cadastro simultâneo, transação) fica em `ficha-nome-server.ts`.
 */

// Caracteres invisíveis que vêm de copiar e colar (espaço de largura zero, hífen suave, BOM...).
const INVISIBLE = /[\u200b-\u200d\u2060\u00ad\ufeff]/g;

/**
 * Forma "comparável" do nome: sem maiúscula/minúscula, sem acento, sem espaço sobrando e com
 * hífen/travessão e aspas "curvas" tratados como os comuns (texto colado do Word/iFood costuma
 * trazer "–" no lugar de "-"). "Ceviche  Branco", "ceviche branco " e "CEVICHÉ BRANCO" viram todos
 * "ceviche branco"; "Combo 1 – 40 peças" e "Combo 1 - 40 peças" também são o mesmo nome.
 */
export function normalizeProductName(name: string): string {
  return name
    .replace(INVISIBLE, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[\u2010-\u2015\u2212]/g, "-")
    .replace(/[\u2018\u2019\u201b]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

/** Nome como é gravado: sem caractere invisível, sem espaço nas pontas e com um único espaço entre as palavras. */
export function cleanProductName(name: string): string {
  return name.replace(INVISIBLE, "").replace(/\s+/g, " ").trim();
}

export type NamedProduct = { id: string; name: string; code: string };

/**
 * Procura, entre os produtos da loja, um que tenha o mesmo nome (comparação normalizada).
 * `excludeId` ignora o próprio produto ao editar. Se houver mais de um (cadastros antigos que já
 * estavam repetidos), devolve o mais antigo da lista recebida (a ordem é a do chamador).
 */
export function findProductWithSameName<T extends NamedProduct>(
  products: T[],
  name: string,
  excludeId?: string | null
): T | null {
  const wanted = normalizeProductName(name);
  if (!wanted) return null;
  for (const p of products) {
    if (excludeId && p.id === excludeId) continue;
    if (normalizeProductName(p.name) === wanted) return p;
  }
  return null;
}

export function duplicateProductNameMessage(existing: Pick<NamedProduct, "name" | "code">): string {
  return `Já existe um produto com esse nome nesta loja: "${existing.name}" (código ${existing.code}). Use um nome diferente (por exemplo, acrescentando o tamanho ou a modalidade).`;
}
