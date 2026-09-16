import { cache } from "react";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import type { Empresa, Prisma } from "@prisma/client";
import { EMPRESA_COOKIE, GRUPO_SENTINEL } from "@/lib/empresa-constants";

export { EMPRESA_COOKIE, GRUPO_SENTINEL };

function hasFullAccess(role: string) {
  return role === "ADMINISTRADOR" || role === "GESTOR";
}

/**
 * Campos "de vitrine" da empresa — os únicos que fazem sentido circular
 * livremente pelo app (seletor de loja, cards, comparativos entre lojas
 * etc.), inclusive em props de componente cliente. Nunca inclua aqui
 * `saiposApiToken`, `metaAdsAccessToken` ou qualquer outro campo de
 * integração/segredo: esses só devem ser lidos, no servidor, para a loja
 * ativa específica (ver `getActiveEmpresaContext` abaixo).
 */
const EMPRESA_SUMMARY_SELECT = {
  id: true,
  key: true,
  name: true,
  logo: true,
  color: true,
  active: true,
  order: true,
  metaCmvPercent: true,
} as const;

export type EmpresaSummary = Pick<Empresa, keyof typeof EMPRESA_SUMMARY_SELECT>;

/**
 * Lista de lojas que o usuário pode acessar — usada pelo seletor de loja,
 * por comparativos entre lojas e por checagens de "esse id está entre os
 * permitidos?". Propositalmente enxuta (ver `EMPRESA_SUMMARY_SELECT`): não
 * traz tokens/segredos de integração, então é sempre seguro repassar o
 * resultado direto pra uma resposta de API ou prop de componente cliente.
 */
export const getUserEmpresas = cache(async (userId: string, role: string): Promise<EmpresaSummary[]> => {
  if (hasFullAccess(role)) {
    return prisma.empresa.findMany({
      where: { active: true },
      orderBy: { order: "asc" },
      select: EMPRESA_SUMMARY_SELECT,
    });
  }
  const access = await prisma.userEmpresaAccess.findMany({
    where: { userId },
    include: { empresa: { select: EMPRESA_SUMMARY_SELECT } },
  });
  return access.map((a) => a.empresa).filter((e) => e.active);
});

export async function userCanViewGrupoNord(userId: string, role: string, flag: boolean) {
  if (hasFullAccess(role)) return true;
  return flag;
}

export type EmpresaContext =
  | { mode: "single"; empresa: Empresa; empresas: EmpresaSummary[]; canViewGrupoNord: boolean }
  | { mode: "grupo"; empresas: EmpresaSummary[]; canViewGrupoNord: boolean };

/**
 * Resolve o contexto de empresa ativo para a requisição atual, a partir do
 * cookie de loja selecionada, validando contra as empresas permitidas para o
 * usuário logado. Cai para a loja padrão do usuário ou a primeira disponível.
 *
 * Envolvida em `cache()` do React: como essa função é chamada em praticamente
 * toda página do portal (às vezes mais de uma vez na mesma requisição), o
 * cache garante que as consultas ao banco rodem só uma vez por requisição.
 */
export const getActiveEmpresaContext = cache(async (): Promise<EmpresaContext | null> => {
  const session = await auth();
  if (!session?.user) return null;

  const [empresas, dbUser] = await Promise.all([
    getUserEmpresas(session.user.id, session.user.role),
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: { canViewGrupoNord: true, defaultEmpresaId: true },
    }),
  ]);

  const canViewGrupoNord = await userCanViewGrupoNord(
    session.user.id,
    session.user.role,
    dbUser?.canViewGrupoNord ?? false
  );

  const cookieStore = await cookies();
  const activeId = cookieStore.get(EMPRESA_COOKIE)?.value;

  if (activeId === GRUPO_SENTINEL && canViewGrupoNord) {
    return { mode: "grupo", empresas, canViewGrupoNord };
  }

  // Decide qual loja fica ativa (cookie > padrão do usuário > primeira da
  // lista), sempre validando o id contra `empresas` — a lista já filtrada
  // pelo que esse usuário pode acessar. Só depois disso buscamos o
  // registro completo (com os campos de integração) dessa loja específica;
  // nunca dos outros itens da lista.
  const candidateId =
    (activeId && empresas.some((e) => e.id === activeId) ? activeId : null) ??
    (dbUser?.defaultEmpresaId && empresas.some((e) => e.id === dbUser.defaultEmpresaId)
      ? dbUser.defaultEmpresaId
      : null) ??
    empresas[0]?.id ??
    null;

  if (!candidateId) return null;

  const empresa = await prisma.empresa.findUnique({ where: { id: candidateId } });
  if (!empresa) return null;

  return { mode: "single", empresa, empresas, canViewGrupoNord };
});

/** IDs de empresa a considerar numa query (uma loja, ou todas em modo Grupo). */
export function empresaIdsForContext(ctx: EmpresaContext): string[] {
  return ctx.mode === "single" ? [ctx.empresa.id] : ctx.empresas.map((e) => e.id);
}

export async function assertEmpresaAccess(userId: string, role: string, empresaId: string) {
  if (hasFullAccess(role)) return true;
  const access = await prisma.userEmpresaAccess.findUnique({
    where: { userId_empresaId: { userId, empresaId } },
  });
  return !!access;
}

/**
 * Para rotas de escrita: exige que exista uma loja única ativa (não o modo
 * "Grupo Nord" consolidado) e retorna essa empresa. Use para decidir a
 * empresaId de um novo registro sem confiar em valor enviado pelo cliente.
 */
export async function requireActiveSingleEmpresa(): Promise<Empresa | null> {
  const ctx = await getActiveEmpresaContext();
  if (!ctx || ctx.mode !== "single") return null;
  return ctx.empresa;
}

/**
 * Filtro Prisma de "usuários ativos com acesso a pelo menos uma destas lojas" — mesmo critério
 * de `assertEmpresaAccess`/`getUserEmpresas`: ADMINISTRADOR/GESTOR sempre contam (acesso a todas
 * as lojas); os demais cargos só entram com `UserEmpresaAccess` explícito pra pelo menos uma das
 * `empresaIds`. Mesmo critério já usado por `getStoreActiveUsers`
 * (src/lib/manutencao-server.ts), mas generalizado pra aceitar uma lista (a maioria das telas usa
 * `empresaIdsForContext(ctx)`, que pode ter mais de um id no modo Grupo Nord).
 */
function activeUserInEmpresasWhere(empresaIds: string[]): Prisma.UserWhereInput {
  return {
    active: true,
    OR: [{ role: { in: ["ADMINISTRADOR", "GESTOR"] } }, { empresaAccess: { some: { empresaId: { in: empresaIds } } } }],
  };
}

export type TeamMemberOption = { id: string; name: string };

/**
 * Usuários ativos selecionáveis como "Responsável"/"Membro da equipe" — usado pelos seletores de
 * Tarefas, Checklist, Produção, Manutenção, Marketing, Loja Nord e Recebimento de estoque.
 * Sempre escopado à(s) loja(s) do contexto ativo (passe `empresaIdsForContext(ctx)`, ou
 * `[empresa.id]` quando só uma loja específica faz sentido) — nunca a lista global de usuários
 * ativos da rede inteira: antes desta função existir, essas telas chamavam
 * `prisma.user.findMany({ where: { active: true } })` direto, sem filtro nenhum de loja, e
 * qualquer usuário via o nome de colaboradores de TODAS as lojas nesses seletores (inclusive
 * podendo, do lado da escrita, atribuir a tarefa/checklist a alguém de outra loja — ver
 * `findUsersWithoutEmpresaAccess` abaixo pra essa validação).
 *
 * Só retorna `id`/`name` — nunca e-mail/cargo (mesmo racional de `EMPRESA_SUMMARY_SELECT` acima
 * pra `Empresa`): esses campos viram prop de Client Component, ficando visíveis no HTML/RSC
 * payload a qualquer um que carregue a tela, mesmo sem motivo pra ver o e-mail de um colega.
 */
export async function getSelectableTeamMembers(empresaIds: string[]): Promise<TeamMemberOption[]> {
  if (empresaIds.length === 0) return [];
  return prisma.user.findMany({
    where: activeUserInEmpresasWhere(empresaIds),
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
}

/**
 * Dentre `userIds`, quais NÃO têm acesso a `empresaId` (mesmo critério de `assertEmpresaAccess`,
 * checado usuário a usuário) — ids inexistentes também entram no resultado, nunca são ignorados
 * em silêncio. Retorno vazio = todos os ids passaram.
 *
 * Use nas rotas de escrita que gravam um id de usuário vindo do corpo da requisição num registro
 * de uma loja específica (responsável, substituto, validador, assignees de tarefa etc.), pra
 * rejeitar quem não pertence a essa loja em vez de confiar cegamente no id enviado pelo cliente —
 * mesmo padrão já usado em `POST /api/loja-nord/pontos`. Sem essa checagem, qualquer usuário
 * ativo da empresa toda podia ser atribuído a um registro de uma loja à qual não tem acesso
 * nenhum.
 */
export async function findUsersWithoutEmpresaAccess(
  userIds: (string | null | undefined)[],
  empresaId: string
): Promise<string[]> {
  const uniqueIds = Array.from(new Set(userIds.filter((id): id is string => !!id)));
  if (uniqueIds.length === 0) return [];
  const users = await prisma.user.findMany({ where: { id: { in: uniqueIds } }, select: { id: true, role: true } });
  const roleById = new Map(users.map((u) => [u.id, u.role]));
  const invalid: string[] = [];
  for (const id of uniqueIds) {
    const role = roleById.get(id);
    if (!role || !(await assertEmpresaAccess(id, role, empresaId))) invalid.push(id);
  }
  return invalid;
}
