import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * RH — catálogo de Cargos e Setores (`EmployeeCargo`/`EmployeeSetor`, ver schema.prisma).
 *
 * Até aqui, `Employee.cargo`/`Employee.setor` eram texto livre digitado em RH > Colaboradores —
 * o que já causou um bug real: um colaborador de "liderança" foi cadastrado com um `cargo` que
 * não batia, nem por acidente, com nenhum dos 3 nomes fixos do catálogo do Fechamento do Dia
 * (`FechamentoCargo.nome`, comparados por igualdade exata em `podeExecutarFechamentoCargo`,
 * @/lib/fechamento-server) — a pessoa não conseguia preencher o formulário, sem nenhum aviso na
 * tela. Corrigido manualmente pelo usuário para este caso pontual, mas pedido explícito depois
 * disso: "Cargo"/"Setor" em RH > Colaboradores viram uma lista de opções já cadastradas (tela em
 * si é fase futura, do Caio), em vez de digitação livre.
 *
 * `resolveEmployeeCargo`/`resolveEmployeeSetor` são o mecanismo por trás dessa lista: toda rota
 * que grava `Employee.cargo`/`.setor` (criar, editar, importar planilha) passa o texto por aqui
 * antes de gravar. Mesmo racional já usado no projeto para "não deixar um valor novo cair
 * silenciosamente em algo genérico" (ver CLAUDE.md — aplicado antes a `PaymentMethod`, um enum
 * fixo do Prisma; aqui o catálogo é uma tabela editável, então o valor não reconhecido é
 * CADASTRADO automaticamente em vez de precisar de uma migration): se o texto (já normalizado por
 * trim) já bate com um item existente do catálogo daquela empresa, reaproveita; se não bate com
 * nenhum, cadastra um item novo na hora. `Employee.cargo`/`.setor` continuam sendo colunas de
 * texto (não uma FK) — ver comentário do bloco "RH — CATÁLOGO DE CARGOS E SETORES" em
 * schema.prisma para o porquê dessa escolha.
 */

export type ResolveCatalogResult = { ok: true; nome: string; criado: boolean } | { ok: false; error: string };

export async function resolveEmployeeCargo(empresaId: string, cargoBruto: unknown): Promise<ResolveCatalogResult> {
  return resolveCatalogValue(prisma.employeeCargo, "cargo", empresaId, cargoBruto);
}

export async function resolveEmployeeSetor(empresaId: string, setorBruto: unknown): Promise<ResolveCatalogResult> {
  return resolveCatalogValue(prisma.employeeSetor, "setor", empresaId, setorBruto);
}

/**
 * Implementação compartilhada por `resolveEmployeeCargo`/`resolveEmployeeSetor` — os dois
 * catálogos (`EmployeeCargo`/`EmployeeSetor`) têm exatamente a mesma forma (`empresaId` + `nome`
 * único por empresa), só a tabela muda. `delegate` aceita qualquer um dos dois Prisma delegates
 * (mesmo formato de `findUnique`/`create` usado por ambos os models gerados).
 */
async function resolveCatalogValue(
  delegate: {
    findUnique: (args: { where: { empresaId_nome: { empresaId: string; nome: string } } }) => Promise<{ nome: string } | null>;
    create: (args: { data: { empresaId: string; nome: string } }) => Promise<{ nome: string }>;
  },
  campo: "cargo" | "setor",
  empresaId: string,
  valorBruto: unknown
): Promise<ResolveCatalogResult> {
  if (typeof valorBruto !== "string" || !valorBruto.trim()) {
    return { ok: false, error: `Informe o ${campo}.` };
  }
  const nome = valorBruto.trim();

  const existente = await delegate.findUnique({ where: { empresaId_nome: { empresaId, nome } } });
  if (existente) return { ok: true, nome: existente.nome, criado: false };

  try {
    const criado = await delegate.create({ data: { empresaId, nome } });
    return { ok: true, nome: criado.nome, criado: true };
  } catch (e) {
    // Corrida (raríssima, mas possível: dois colaboradores salvos com o mesmo cargo/setor novo
    // ao mesmo tempo) — o `findUnique` acima não viu nada, mas outra requisição criou o mesmo
    // `nome` entre esse `findUnique` e este `create`. `@@unique([empresaId, nome])` já garante
    // que nunca existem duas linhas iguais; aqui só tratamos esse caso como sucesso (reaproveita
    // a linha que a outra requisição acabou de criar) em vez de devolver 500 pra quem só estava
    // tentando salvar um colaborador.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      const criadoPorOutraRequisicao = await delegate.findUnique({ where: { empresaId_nome: { empresaId, nome } } });
      if (criadoPorOutraRequisicao) return { ok: true, nome: criadoPorOutraRequisicao.nome, criado: false };
    }
    throw e;
  }
}

/** Catálogo de cargos de uma empresa, ativos primeiro — usado pela futura tela de seleção. */
export async function listEmployeeCargos(empresaId: string) {
  return prisma.employeeCargo.findMany({
    where: { empresaId },
    orderBy: [{ ativo: "desc" }, { nome: "asc" }],
  });
}

/** Catálogo de setores de uma empresa, ativos primeiro — usado pela futura tela de seleção. */
export async function listEmployeeSetores(empresaId: string) {
  return prisma.employeeSetor.findMany({
    where: { empresaId },
    orderBy: [{ ativo: "desc" }, { nome: "asc" }],
  });
}
