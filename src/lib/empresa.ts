import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import type { Empresa } from "@prisma/client";
import { EMPRESA_COOKIE, GRUPO_SENTINEL } from "@/lib/empresa-constants";

export { EMPRESA_COOKIE, GRUPO_SENTINEL };

function hasFullAccess(role: string) {
  return role === "ADMINISTRADOR" || role === "GESTOR";
}

export async function getUserEmpresas(userId: string, role: string): Promise<Empresa[]> {
  if (hasFullAccess(role)) {
    return prisma.empresa.findMany({ where: { active: true }, orderBy: { order: "asc" } });
  }
  const access = await prisma.userEmpresaAccess.findMany({
    where: { userId },
    include: { empresa: true },
  });
  return access.map((a) => a.empresa).filter((e) => e.active);
}

export async function userCanViewGrupoNord(userId: string, role: string, flag: boolean) {
  if (hasFullAccess(role)) return true;
  return flag;
}

export type EmpresaContext =
  | { mode: "single"; empresa: Empresa; empresas: Empresa[]; canViewGrupoNord: boolean }
  | { mode: "grupo"; empresas: Empresa[]; canViewGrupoNord: boolean };

/**
 * Resolve o contexto de empresa ativo para a requisição atual, a partir do
 * cookie de loja selecionada, validando contra as empresas permitidas para o
 * usuário logado. Cai para a loja padrão do usuário ou a primeira disponível.
 */
export async function getActiveEmpresaContext(): Promise<EmpresaContext | null> {
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

  const fromCookie = activeId ? empresas.find((e) => e.id === activeId) : undefined;
  if (fromCookie) {
    return { mode: "single", empresa: fromCookie, empresas, canViewGrupoNord };
  }

  const fromDefault = dbUser?.defaultEmpresaId
    ? empresas.find((e) => e.id === dbUser.defaultEmpresaId)
    : undefined;
  if (fromDefault) {
    return { mode: "single", empresa: fromDefault, empresas, canViewGrupoNord };
  }

  if (empresas[0]) {
    return { mode: "single", empresa: empresas[0], empresas, canViewGrupoNord };
  }

  return null;
}

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
