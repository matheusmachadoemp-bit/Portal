import { cache } from "react";
import { prisma } from "@/lib/prisma";
import {
  ACCESS_LEVEL_TO_MODULE_FLAGS,
  defaultLevelForProfileKey,
  defaultProfileKeyForRole,
  type PermissionAction,
} from "@/lib/permissions";

/**
 * Busca TODAS as permissões do usuário — role, perfil atribuído, todos os
 * `UserPermission` (override pessoal, qualquer módulo/subcategoria) e
 * todos os `ModulePermission` do perfil (qualquer módulo) — numa única
 * consulta, memoizada por requisição via `cache()` do React (mesma
 * garantia já usada em `getActiveEmpresaContext`/`getUserEmpresas`,
 * `@/lib/empresa.ts`: deduplica só DENTRO da mesma requisição/renderização;
 * a próxima requisição sempre busca de novo, sem risco de servir permissão
 * desatualizada entre requisições).
 *
 * Ao contrário da versão anterior (que filtrava `where: { moduleKey: {in:
 * keys} }` na própria query, trazendo só as linhas do módulo sendo checado
 * NAQUELA chamada), esta busca não filtra por módulo de propósito: cada
 * usuário tem no máximo ~20 linhas de `UserPermission` (uma por módulo/
 * subcategoria com override pessoal) e ~20 de `ModulePermission` (uma por
 * módulo do catálogo, ver `MODULES` em `@/lib/permissions`) — poucas
 * dezenas de linhas no total, barato de trazer inteiro de uma vez — e isso
 * permite que `hasModulePermission` seja chamada várias vezes na mesma
 * requisição com `moduleKey`/`action`/`subcategoryKey` diferentes (ex.:
 * canView + canCreate + canEdit + canDelete do mesmo módulo numa página, ou
 * módulos diferentes checados por `layout.tsx` e por `page.tsx`) sem repetir
 * a ida ao banco: achado da auditoria de performance (tarefa #285) — medido
 * ao vivo, isso respondia por boa parte das ~3,6 a ~7,7 consultas
 * redundantes na tabela `User` por carregamento de página (a outra parte,
 * a duplicação de `auth()` em si, já foi corrigida em `src/auth.ts`).
 */
const loadUserPermissionData = cache((userId: string) =>
  prisma.user.findUnique({
    where: { id: userId },
    select: {
      role: true,
      permissionProfileId: true,
      permissions: { select: { moduleKey: true, level: true } },
      permissionProfile: {
        select: {
          modulePermissions: {
            select: { moduleKey: true, canView: true, canExecute: true, canCreate: true, canEdit: true, canDelete: true },
          },
        },
      },
    },
  })
);

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

  const user = await loadUserPermissionData(userId);
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

/**
 * Garante que uma categoria/subcategoria do menu lateral recém-criada pela própria UI (sempre
 * com uma `moduleKey` nunca vista antes por NENHUM `ModulePermission` — `MODULES`, em
 * `@/lib/permissions`, é uma lista fixa em código, e `prisma/seed.ts` só cria linhas de
 * `ModulePermission` para as chaves que já estão lá) não fique travada no pior caso possível:
 * "nem o Administrador/Gestor que acabou de criar consegue ver o que criou". Ver a regra 6 do
 * comentário de `hasModulePermission` acima — sem NENHUMA linha pra uma `moduleKey`, o padrão já
 * é negar pra todo mundo que não seja `role === "ADMINISTRADOR"` (que ignora perfil/linha
 * completamente, regra 1). `buildVisibilityResolver` (@/lib/permissions, usado pelo menu lateral
 * em src/app/portal/layout.tsx) segue a mesma regra de negar por padrão sem linha nenhuma.
 *
 * Só cria linha para os perfis PADRÃO de quem tem permissão pra criar categoria/subcategoria
 * pela sidebar — Administrador e Gestor, os dois únicos cargos liberados em
 * `POST /api/menu`/`POST /api/menu/subcategories` (`ROLE_TO_PERMISSION_PROFILE_KEY`) — no mesmo
 * nível que `prisma/seed.ts` usaria se essa `moduleKey` estivesse em `MODULES` desde o início
 * (`defaultLevelForProfileKey`, a mesma função que o seed já usa). Os demais perfis (funcionário,
 * líder, supervisor, gerente, marketing, financeiro) de propósito NÃO ganham linha nenhuma aqui —
 * continuam caindo no "nenhuma configuração encontrada" = negado, preservando o padrão de negar
 * por padrão pra quem não criou a categoria. Garante o mínimo pedido (quem pode criar já enxerga
 * o que criou, sem precisar de um passo extra de liberar permissão pra si mesmo) sem abrir pra
 * "todo mundo vê por padrão, sem ninguém ter liberado" — qualquer liberação pra outros perfis
 * continua sendo uma decisão manual na tela de Permissões, do jeito que já é pra todo o resto.
 *
 * Chamada só por `POST /api/menu` (categoria nova) e `POST /api/menu/subcategories` (subcategoria
 * nova — chamada com a `key` da categoria MÃE, não uma chave composta: uma subcategoria nova
 * sem override próprio herda a visibilidade da categoria inteira, igual já documentado em
 * `buildVisibilityResolver`; a tela de Perfis de Permissão hoje só configura módulos inteiros,
 * nunca subcategorias — ver prisma/seed.ts). `upsert` com `update: {}` (nunca sobrescreve): mesma
 * semântica do loop de seed — se uma linha já existir (categoria antiga, de antes desta função
 * existir, ou um admin já tiver configurado manualmente), não pisa em cima.
 */
export async function ensureDefaultModulePermissions(moduleKey: string): Promise<void> {
  const creatorProfileKeys = [defaultProfileKeyForRole("ADMINISTRADOR"), defaultProfileKeyForRole("GESTOR")];
  const profiles = await prisma.permissionProfile.findMany({
    where: { key: { in: creatorProfileKeys } },
    select: { id: true, key: true },
  });

  await Promise.all(
    profiles.map((profile) =>
      prisma.modulePermission.upsert({
        where: { profileId_moduleKey: { profileId: profile.id, moduleKey } },
        update: {},
        create: {
          profileId: profile.id,
          moduleKey,
          ...ACCESS_LEVEL_TO_MODULE_FLAGS[defaultLevelForProfileKey(profile.key)],
        },
      })
    )
  );
}

/**
 * Subcategoria NOVA criada pela sidebar em cima de uma categoria que já existe (RH, Financeiro,
 * Administrativo, ...): sem uma linha própria ela herdaria o `canView` (e o nível de edição) da
 * categoria inteira — e o conteúdo genérico (src/lib/generic-content.ts, /api/generic-files) só
 * confere `hasModulePermission`, sem os gates de cargo (`MANAGER_ROLES`, etc.) que cada módulo
 * aplica por fora nas próprias páginas. Resultado: um Funcionário passaria a ver e baixar o que
 * um Gestor enviasse numa subcategoria nova de RH/Financeiro. Por isso a subcategoria nasce com
 * linha de chave composta (`categoria:subcategoria`) pra TODOS os perfis — Administrador e Gestor
 * (quem pode criar) no nível padrão do cargo, os demais sem nenhum acesso (`NENHUM`). Uma linha
 * composta encerra a herança em `hasModulePermission` e em `buildVisibilityResolver`; liberar
 * pra outras pessoas passa a ser decisão explícita (override por usuário na tela de Usuários).
 * `upsert` com `update: {}`: nunca sobrescreve uma linha já configurada.
 */
export async function ensureDefaultSubcategoryPermissions(categoryKey: string, subcategoryKey: string): Promise<void> {
  const moduleKey = `${categoryKey}:${subcategoryKey}`;
  const creatorProfileKeys = new Set([defaultProfileKeyForRole("ADMINISTRADOR"), defaultProfileKeyForRole("GESTOR")]);
  const profiles = await prisma.permissionProfile.findMany({ select: { id: true, key: true } });

  await Promise.all(
    profiles.map((profile) =>
      prisma.modulePermission.upsert({
        where: { profileId_moduleKey: { profileId: profile.id, moduleKey } },
        update: {},
        create: {
          profileId: profile.id,
          moduleKey,
          ...ACCESS_LEVEL_TO_MODULE_FLAGS[
            creatorProfileKeys.has(profile.key) ? defaultLevelForProfileKey(profile.key) : "NENHUM"
          ],
        },
      })
    )
  );
}
