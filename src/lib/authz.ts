import { prisma } from "@/lib/prisma";
import { ACCESS_LEVEL_TO_MODULE_FLAGS, type PermissionAction } from "@/lib/permissions";

// Este arquivo é separado de `@/lib/permissions` de propósito: `permissions.ts`
// é importado por componentes client (ex.: `permissoes-client.tsx`, que tem
// "use client"), então não pode carregar o Prisma Client em tempo de módulo
// (isso quebraria o bundle do client, que não pode empacotar dependências
// como `pg`). Este arquivo só deve ser importado por código server-side
// (rotas de API, server actions, libs de servidor).

/**
 * Perfis de Permissão (`PermissionProfile`/`ModulePermission`) são uma camada
 * ADICIONAL de restrição em cima do cargo (`Role`) do usuário — nunca
 * substituem os checks de cargo já existentes numa rota, só podem
 * restringir MAIS um usuário específico dentro do que o cargo dele já
 * permitiria. Por isso `hasModulePermission` deve sempre ser chamada DEPOIS
 * do check de cargo já existente na rota, nunca antes nem no lugar dele.
 *
 * `subcategoryKey`, quando informado, permite checar a permissão de uma
 * subcategoria específica dentro do módulo (ex.: "vendas" + "faturamento").
 * Uma permissão por usuário (`UserPermission`, editada em Usuários > Novo
 * usuário) tem prioridade sobre o perfil de permissão — é um ajuste pontual
 * só para aquele usuário. Em cada camada, a chave da subcategoria
 * (`${moduleKey}:${subcategoryKey}`) tem prioridade sobre a chave do módulo
 * inteiro.
 *
 * Regras (aplicadas nessa ordem; a primeira que encontrar uma linha decide):
 * 1. `UserPermission` do usuário para a subcategoria.
 * 2. `UserPermission` do usuário para o módulo inteiro.
 * 3. `ModulePermission` do perfil do usuário para a subcategoria.
 * 4. `ModulePermission` do perfil do usuário para o módulo inteiro.
 * 5. Nenhuma configuração encontrada: libera — ninguém é bloqueado só por
 *    ausência de configuração (usuário sem perfil, perfil sem linha para
 *    este módulo, etc.).
 */
export async function hasModulePermission(
  userId: string,
  moduleKey: string,
  action: PermissionAction,
  subcategoryKey?: string
): Promise<boolean> {
  const compoundKey = subcategoryKey ? `${moduleKey}:${subcategoryKey}` : null;
  const keys = compoundKey ? [moduleKey, compoundKey] : [moduleKey];

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      permissionProfileId: true,
      permissions: {
        where: { moduleKey: { in: keys } },
        select: { moduleKey: true, level: true },
      },
      permissionProfile: {
        select: {
          modulePermissions: {
            where: { moduleKey: { in: keys } },
            select: { moduleKey: true, canView: true, canCreate: true, canEdit: true, canDelete: true },
          },
        },
      },
    },
  });
  if (!user) return true;

  const userOverride =
    (compoundKey && user.permissions.find((p) => p.moduleKey === compoundKey)) ||
    user.permissions.find((p) => p.moduleKey === moduleKey);
  if (userOverride) return ACCESS_LEVEL_TO_MODULE_FLAGS[userOverride.level][action];

  if (!user.permissionProfileId) return true;

  const modulePermissions = user.permissionProfile?.modulePermissions ?? [];
  const profileRow =
    (compoundKey && modulePermissions.find((m) => m.moduleKey === compoundKey)) ||
    modulePermissions.find((m) => m.moduleKey === moduleKey);
  if (!profileRow) return true;

  return profileRow[action];
}
