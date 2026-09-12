import { prisma } from "@/lib/prisma";
import { ACCESS_LEVEL_TO_MODULE_FLAGS, defaultProfileKeyForRole, type PermissionAction } from "@/lib/permissions";

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
 * Regras (aplicadas nessa ordem; a primeira que decidir vence):
 * 1. `role === "ADMINISTRADOR"`: libera sempre, sem exceção. Administrador é
 *    o único cargo com acesso total garantido pelo próprio cargo (mesma
 *    regra já aplicada por `buildVisibilityResolver`, em
 *    `@/lib/permissions`, para o menu lateral — replicada aqui de propósito
 *    para as duas funções nunca divergirem sobre quem é "sempre libera").
 *    Não depende de `permissionProfileId` estar preenchido nem de nenhuma
 *    linha em `ModulePermission`/`UserPermission`.
 * 2. `UserPermission` do usuário para a subcategoria.
 * 3. `UserPermission` do usuário para o módulo inteiro.
 * 4. `ModulePermission` do perfil do usuário para a subcategoria.
 * 5. `ModulePermission` do perfil do usuário para o módulo inteiro.
 * 6. Nenhuma configuração encontrada (usuário não encontrado, sem perfil
 *    atribuído, ou perfil sem linha para este módulo): NEGA. Até
 *    2026-09-09 este último caso liberava ("ninguém é bloqueado só por
 *    ausência de configuração") — isso permitia que qualquer usuário
 *    cadastrado sem "Perfil de permissão" (o padrão do formulário de Novo
 *    usuário, se ninguém mexer no campo) ganhasse acesso irrestrito
 *    (ver/criar/editar/excluir) a todos os módulos operacionais. Corrigido
 *    para negar por padrão: só quem tem uma linha explícita liberando a
 *    ação (perfil ou override pessoal) — ou é Administrador — passa.
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
      role: true,
      permissionProfileId: true,
      permissions: {
        where: { moduleKey: { in: keys } },
        select: { moduleKey: true, level: true },
      },
      permissionProfile: {
        select: {
          modulePermissions: {
            where: { moduleKey: { in: keys } },
            select: { moduleKey: true, canView: true, canExecute: true, canCreate: true, canEdit: true, canDelete: true },
          },
        },
      },
    },
  });
  if (!user) return false;
  if (user.role === "ADMINISTRADOR") return true;

  const userOverride =
    (compoundKey && user.permissions.find((p) => p.moduleKey === compoundKey)) ||
    user.permissions.find((p) => p.moduleKey === moduleKey);
  if (userOverride) return ACCESS_LEVEL_TO_MODULE_FLAGS[userOverride.level][action];

  if (!user.permissionProfileId) return false;

  const modulePermissions = user.permissionProfile?.modulePermissions ?? [];
  const profileRow =
    (compoundKey && modulePermissions.find((m) => m.moduleKey === compoundKey)) ||
    modulePermissions.find((m) => m.moduleKey === moduleKey);
  if (!profileRow) return false;

  return profileRow[action];
}

/**
 * Resolve o `PermissionProfile.id` padrão para um cargo (Role), usado pelas rotas
 * POST/PATCH `/api/usuarios` quando o formulário de usuário deixa "Perfil de permissão"
 * em branco. Depois da correção do fail-open acima, usuário sem perfil atribuído fica
 * sem acesso a nenhum módulo operacional — então em vez de aceitar `permissionProfileId`
 * vazio (o que hoje significaria "sem acesso a nada", uma armadilha fácil de cair sem
 * querer), a rota sempre resolve um perfil de verdade a partir do cargo escolhido, com o
 * mesmo mapeamento cargo -> perfil que `prisma/seed.ts` usa para usuários sem perfil.
 * Retorna `null` só no caso defensivo em que o perfil padrão daquele cargo não existe no
 * banco (não deveria acontecer: os 8 perfis de `PERMISSION_PROFILES` são criados pelo
 * seed) — nesse caso a rota cai de volta no comportamento de "sem perfil", agora seguro
 * (nega por padrão) em vez de inseguro.
 */
export async function resolveDefaultPermissionProfileId(role: string): Promise<string | null> {
  const profile = await prisma.permissionProfile.findUnique({
    where: { key: defaultProfileKeyForRole(role) },
    select: { id: true },
  });
  return profile?.id ?? null;
}
