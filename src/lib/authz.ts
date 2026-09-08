import { prisma } from "@/lib/prisma";
import type { PermissionAction } from "@/lib/permissions";

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
 * Regras:
 * - Usuário sem `permissionProfileId` (nenhum perfil atribuído): libera —
 *   comportamento atual preservado, ninguém sem perfil atribuído pode ser
 *   bloqueado por isto.
 * - Usuário com perfil, mas sem linha de `ModulePermission` para este
 *   `moduleKey` (não deveria acontecer depois do backfill da migration da
 *   branch `claude/perfis-permissao-prep`, mas é tratado defensivamente
 *   porque essa migration pode ainda não ter rodado em produção): libera —
 *   mesma lógica, nunca bloquear por ausência de configuração.
 * - Usuário com perfil e linha de `ModulePermission` para este módulo:
 *   respeita o valor gravado na flag correspondente à ação pedida (seja o
 *   valor antigo, de antes do backfill, ou o já corrigido).
 */
export async function hasModulePermission(
  userId: string,
  moduleKey: string,
  action: PermissionAction
): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      permissionProfileId: true,
      permissionProfile: {
        select: {
          modulePermissions: {
            where: { moduleKey },
            select: { canView: true, canCreate: true, canEdit: true, canDelete: true },
          },
        },
      },
    },
  });

  if (!user?.permissionProfileId) return true;

  const modulePermission = user.permissionProfile?.modulePermissions[0];
  if (!modulePermission) return true;

  return modulePermission[action];
}
