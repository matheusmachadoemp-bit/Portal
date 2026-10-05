import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { hasModulePermission } from "@/lib/authz";
import type { PermissionAction } from "@/lib/permissions";

/**
 * Conteúdo genérico de fallback (pastas/arquivos, `GenericFileItem`) para toda categoria/
 * subcategoria do menu lateral (`Category`/`Subcategory`, cadastradas pelo sidebar — ver
 * POST /api/menu e /api/menu/subcategories) sem rota física/mapa hardcoded próprio.
 *
 * Usado por três lugares, todos delegando pra `loadGenericContent` abaixo:
 * 1. `src/app/portal/[category]/[sub]/page.tsx` e `src/app/portal/[category]/page.tsx` —
 *    catch-all de categoria nunca vista antes (sem pasta física própria em `src/app/portal/`).
 * 2. Um `[sub]/page.tsx` por categoria já existente do "Grupo B" (Financeiro, Estoque, RH, CRM,
 *    Administrativo, Universidade, Vendas, Loja Nord, Reunião, CMV, Satisfação do Cliente,
 *    Manutenção, Tarefas — ver o arquivo "[sub]/page.tsx" dentro da pasta de cada uma, em
 *    src/app/portal/) — cada um chama `loadGenericContent` com a própria `categoryKey` fixa, só
 *    `sub` é dinâmico.
 *    Marketing e Produção ficam de fora de propósito (outras tarefas em andamento em paralelo,
 *    tocando esses módulos — ver tarefa "categoria-generica").
 * 3. O patch do "Grupo A" (Ficha Técnica/Metas, `ficha-tecnica/[sub]/page.tsx` e
 *    `metas/[sub]/page.tsx`): quando o mapa hardcoded de cada um não bate com o `sub` da URL, cai
 *    aqui como segunda tentativa antes do `notFound()` de verdade.
 */

export type GenericScope =
  | {
      kind: "subcategory";
      id: string;
      categoryId: string;
      categoryKey: string;
      categoryName: string;
      subcategoryKey: string;
      subcategoryName: string;
    }
  | { kind: "category"; id: string; categoryKey: string; categoryName: string };

export type SerializedGenericFile = {
  id: string;
  name: string;
  parentId: string | null;
  isFolder: boolean;
  fileUrl: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  version: number;
  createdAt: string;
  createdBy: { name: string };
};

export type GenericContentPageData = {
  scope: GenericScope;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  files: SerializedGenericFile[];
};

/**
 * Resolve e autoriza o conteúdo genérico de uma categoria/subcategoria a partir da `key` da URL
 * (nunca do id — a página só tem a `key`, vinda do segmento dinâmico da rota). `notFound()` se a
 * `key` não corresponder a nenhuma `Category`/`Subcategory` cadastrada (a rota existir não
 * significa que o registro existe — ver comentário de `GenericScope` acima); `redirect()` pra
 * "/portal/inicio" se o usuário não tiver `canView` — MESMO comportamento de negar por padrão já
 * usado por `ficha-tecnica/[sub]/page.tsx` e `metas/[sub]/page.tsx` (nunca um 403/tela de erro,
 * sempre redireciona pra Início, consistente com o resto do Portal).
 *
 * Preserva a prioridade de chave composta > módulo inteiro já documentada em
 * `hasModulePermission` (@/lib/authz): passar `subcategoryKey` quando houver subcategoria deixa
 * aquela função decidir a herança, nunca decidida aqui.
 */
export async function loadGenericContent(params: {
  categoryKey: string;
  subcategoryKey?: string;
}): Promise<GenericContentPageData> {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const category = await prisma.category.findUnique({ where: { key: params.categoryKey } });
  if (!category) notFound();

  let scope: GenericScope;
  if (params.subcategoryKey) {
    const subcategory = await prisma.subcategory.findUnique({
      where: { categoryId_key: { categoryId: category.id, key: params.subcategoryKey } },
    });
    if (!subcategory) notFound();
    scope = {
      kind: "subcategory",
      id: subcategory.id,
      categoryId: category.id,
      categoryKey: category.key,
      categoryName: category.name,
      subcategoryKey: subcategory.key,
      subcategoryName: subcategory.name,
    };
  } else {
    scope = { kind: "category", id: category.id, categoryKey: category.key, categoryName: category.name };
  }

  const subKeyForCheck = scope.kind === "subcategory" ? scope.subcategoryKey : undefined;
  const [canView, canCreate, canEdit, canDelete] = await Promise.all(
    (["canView", "canCreate", "canEdit", "canDelete"] as PermissionAction[]).map((action) =>
      hasModulePermission(session.user.id, category.key, action, subKeyForCheck)
    )
  );
  if (!canView) redirect("/portal/inicio");

  const files = await prisma.genericFileItem.findMany({
    where: scope.kind === "subcategory" ? { subcategoryId: scope.id } : { categoryId: scope.id },
    orderBy: [{ isFolder: "desc" }, { name: "asc" }],
    include: { createdBy: { select: { name: true } } },
  });

  return {
    scope,
    canCreate,
    canEdit,
    canDelete,
    files: files.map((f) => ({
      id: f.id,
      name: f.name,
      parentId: f.parentId,
      isFolder: f.isFolder,
      fileUrl: f.fileUrl,
      mimeType: f.mimeType,
      sizeBytes: f.sizeBytes,
      version: f.version,
      createdAt: f.createdAt.toISOString(),
      createdBy: { name: f.createdBy.name },
    })),
  };
}

/** Scope de um `GenericFileItem` já existente ou a ser criado — usado só pelas rotas de API
 * (`src/app/api/generic-files/**`), que recebem `categoryId`/`subcategoryId` (ids reais, nunca a
 * `key`) do client. Nunca aceite a `key` vinda do corpo da requisição para decidir permissão —
 * sempre busque pelo id e derive a `key` do registro encontrado no banco, senão um client
 * malicioso poderia mandar um id de uma subcategoria que ele tem acesso junto de uma `key` de
 * outra que ele não tem, pra enganar `hasModulePermission`. */
export type ResolvedGenericScope =
  | { kind: "subcategory"; id: string; categoryKey: string; subcategoryKey: string }
  | { kind: "category"; id: string; categoryKey: string };

export async function resolveGenericScope(input: {
  categoryId?: string | null;
  subcategoryId?: string | null;
}): Promise<ResolvedGenericScope | null> {
  const { categoryId, subcategoryId } = input;
  // Exatamente um dos dois — nunca os dois nem nenhum (ver comentário de `GenericFileItem` em
  // prisma/schema.prisma). Rejeita qualquer outra combinação em vez de adivinhar qual prevalece.
  if (!!subcategoryId === !!categoryId) return null;

  if (subcategoryId) {
    const sub = await prisma.subcategory.findUnique({
      where: { id: subcategoryId },
      select: { id: true, key: true, category: { select: { key: true } } },
    });
    if (!sub) return null;
    return { kind: "subcategory", id: sub.id, categoryKey: sub.category.key, subcategoryKey: sub.key };
  }

  const cat = await prisma.category.findUnique({
    where: { id: categoryId! },
    select: { id: true, key: true },
  });
  if (!cat) return null;
  return { kind: "category", id: cat.id, categoryKey: cat.key };
}

export function genericScopeSubcategoryKey(scope: ResolvedGenericScope): string | undefined {
  return scope.kind === "subcategory" ? scope.subcategoryKey : undefined;
}

/** Atalho pra checar uma ação sobre um `ResolvedGenericScope` já resolvido — usado pelas rotas de
 * API de `GenericFileItem` (list/create/rename/delete), sempre DEPOIS de `resolveGenericScope`,
 * nunca com uma `key` vinda direto do client (ver aviso de segurança acima). */
export async function canAccessGenericScope(
  userId: string,
  scope: ResolvedGenericScope,
  action: PermissionAction
): Promise<boolean> {
  return hasModulePermission(userId, scope.categoryKey, action, genericScopeSubcategoryKey(scope));
}
