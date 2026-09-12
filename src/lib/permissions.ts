import type { AccessLevel, Role } from "@prisma/client";

// Espelha o catálogo de módulos do menu lateral (CATEGORIES em prisma/seed.ts / tabela
// Category). Se um módulo novo for criado no menu, ele também precisa ganhar uma entrada aqui —
// caso contrário ele some da tela de Permissões e, pior, some do menu lateral para qualquer
// usuário com um perfil de permissão atribuído (buildVisibilityResolver só libera módulos que têm
// uma linha de ModulePermission com canView = true; um módulo ausente daqui nunca ganha essa linha).
export const MODULES = [
  { key: "inicio", label: "Início" },
  { key: "vendas", label: "Vendas" },
  { key: "crm", label: "CRM" },
  { key: "reuniao", label: "Reunião" },
  { key: "marketing", label: "Marketing" },
  { key: "universidade", label: "Universidade Grupo Nord" },
  { key: "metas", label: "Metas" },
  { key: "estoque", label: "Estoque" },
  { key: "rh", label: "RH" },
  { key: "financeiro", label: "Financeiro" },
  { key: "administrativo", label: "Administrativo" },
  { key: "ficha-tecnica", label: "Ficha Técnica" },
  { key: "cmv", label: "CMV" },
  { key: "tarefas", label: "Tarefas" },
  { key: "manutencao", label: "Manutenção" },
  { key: "producao", label: "Produção" },
  { key: "loja-nord", label: "Loja Nord" },
  { key: "configuracoes", label: "Configurações" },
  { key: "usuarios", label: "Usuários" },
] as const;

export type ModuleKey = (typeof MODULES)[number]["key"];

// Perfis de permissão (templates), independentes do enum Role do banco —
// um perfil é atribuído a um usuário via User.permissionProfileId.
export const PERMISSION_PROFILES = [
  { key: "administrador", name: "Administrador" },
  { key: "gestor", name: "Gestor" },
  { key: "supervisor", name: "Supervisor" },
  { key: "gerente", name: "Gerente" },
  { key: "lider", name: "Líder" },
  { key: "funcionario", name: "Funcionário" },
  { key: "marketing", name: "Marketing" },
  { key: "financeiro", name: "Financeiro" },
] as const;

export type PermissionAction = "canView" | "canExecute" | "canCreate" | "canEdit" | "canDelete";
export const PERMISSION_ACTIONS: { key: PermissionAction; label: string }[] = [
  { key: "canView", label: "Ver" },
  { key: "canExecute", label: "Executar" },
  { key: "canCreate", label: "Criar" },
  { key: "canEdit", label: "Editar" },
  { key: "canDelete", label: "Excluir" },
];

/**
 * Resolve se uma categoria (`moduleKey`) ou subcategoria (`${moduleKey}:${subKey}`) do
 * menu lateral deve aparecer para um usuário. Combina duas camadas, na mesma ordem de
 * prioridade usada por `hasModulePermission` em `@/lib/authz`:
 *
 * 1. `role === "ADMINISTRADOR"`: sempre vê tudo (retorna `null`, "sem restrição") —
 *    mesma regra de `hasModulePermission`, replicada aqui de propósito para as duas
 *    funções nunca divergirem sobre quem tem acesso garantido pelo cargo.
 * 2. `userOverrides` (`UserPermission`, ajuste pontual daquele usuário, editado em
 *    Usuários > Novo usuário) — se existir uma linha para a chave, ela decide.
 * 3. `modulePermissions` (perfil de permissão atribuído ao usuário) — lista de opt-in:
 *    só os módulos com `canView: true` aparecem; um módulo ausente da lista fica oculto.
 * 4. Sem perfil e sem override para a chave: OCULTO. Até 2026-09-09 esse caso liberava
 *    (mostrava o módulo no menu mesmo sem nenhuma configuração) — igual ao fail-open
 *    corrigido em `hasModulePermission`: um usuário sem perfil atribuído via menu
 *    lateral, mas as rotas por trás de cada módulo já negam de verdade (ou deveriam:
 *    esconder do menu nunca foi proteção real por si só, é só não deixar a UI prometer
 *    algo que a API não entrega mais).
 *
 * Uma subcategoria sem override próprio ("Igual à categoria", a opção em branco na
 * tela de Usuários) precisa herdar a visibilidade da CATEGORIA inteira — não existe
 * (nem pode existir hoje: a tela de Perfis de Permissão só configura módulos inteiros,
 * nunca subcategorias) uma linha de `ModulePermission` do perfil para a chave composta
 * "categoria:subcategoria", então checar `profileSet.has(chaveComposta)` direto sempre
 * dava falso — a subcategoria nunca aparecia pra ninguém que dependesse do perfil,
 * mesmo com "Igual à categoria" selecionado. Por isso, na ausência de um override
 * específico pra subcategoria, o fallback é pra chave da categoria (override pessoal
 * dela, senão o perfil) — o mesmo critério de herança que `hasModulePermission`
 * (@/lib/authz) já aplica pra Ver/Criar/Editar/Excluir.
 */
export function buildVisibilityResolver(
  role: Role | string,
  modulePermissions: { moduleKey: string; canView: boolean }[] | undefined,
  userOverrides: { moduleKey: string; level: AccessLevel }[] | undefined
): ((key: string) => boolean) | null {
  if (role === "ADMINISTRADOR") return null;

  const profileSet = modulePermissions ? new Set(modulePermissions.filter((m) => m.canView).map((m) => m.moduleKey)) : null;
  const overrides = new Map((userOverrides ?? []).map((o) => [o.moduleKey, ACCESS_LEVEL_TO_MODULE_FLAGS[o.level].canView]));

  return (key: string) => {
    if (overrides.has(key)) return overrides.get(key)!;
    const colonIndex = key.indexOf(":");
    const moduleKey = colonIndex === -1 ? key : key.slice(0, colonIndex);
    if (moduleKey !== key && overrides.has(moduleKey)) return overrides.get(moduleKey)!;
    if (profileSet) return profileSet.has(moduleKey);
    return false;
  };
}

// ADMINISTRADOR has full access to everything, always.
export function isAdmin(role: Role) {
  return role === "ADMINISTRADOR";
}

export function canManageUsers(role: Role | string) {
  return role === "ADMINISTRADOR" || role === "GESTOR";
}

export function defaultLevelForRole(role: Role): "VISUALIZAR" | "EDITAR" | "TOTAL" {
  switch (role) {
    case "ADMINISTRADOR":
      return "TOTAL";
    case "GESTOR":
    case "GERENTE":
      return "EDITAR";
    case "SUPERVISOR":
      return "EDITAR";
    default:
      return "VISUALIZAR";
  }
}

export type ModulePermissionFlags = {
  canView: boolean;
  canExecute: boolean;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
};

// Mapeamento entre AccessLevel e as 5 flags de ModulePermission (Ver/Executar/Criar/Editar/Excluir).
//
// Por que este mapeamento e não outro: `defaultLevelForRole()` não varia por módulo — ela recebe
// só o cargo (Role) e devolve um único nível aplicado a todos os módulos igualmente (não há
// parâmetro de módulo na assinatura da função), então um mapeamento AccessLevel -> flags também
// único (não por módulo) é consistente com a única fonte da verdade que já existe. Os níveis são
// cumulativos, cada um incluindo as permissões do nível anterior, na mesma ordem em que já são
// exibidos como colunas na tela de Permissões (Ver, Executar, Criar, Editar, Excluir):
// - NENHUM: nenhuma ação liberada (não é produzido por defaultLevelForRole() hoje, mas mapeado
//   aqui para o enum ficar completo).
// - VISUALIZAR: só enxerga a tela — era o único nível com efeito real até a introdução das
//   permissões por subcategoria (controla a visibilidade do módulo no menu lateral). Fica
//   propositalmente sem `canExecute`: "ver" não deveria implicar em conseguir alterar estado
//   nenhum, nem mesmo o de "executar" — ver achado de segurança abaixo.
// - EXECUTAR: além de ver, pode "rodar" a ação operacional do módulo sem poder criar/editar/
//   excluir a configuração por trás dela — hoje usado só pela subcategoria "tarefas:checklist"
//   (responder itens, anexar foto, concluir a execução do dia), pra separar "quem só executa o
//   checklist" (ex.: Chef, Garçom) de "quem administra o template do checklist" (canCreate/
//   canEdit/canDelete). Introduzido depois que o PR #194 usou `canView` pra liberar essas rotas
//   de execução e o Strix (achado CWE-863) apontou que isso deixava "ver" implicar em "escrever
//   + ganhar pontos de recompensa" — sem essa ação própria não dava pra expressar "só executa"
//   sem também dar acesso de edição do template.
// - EDITAR: vê, executa, cria e edita, mas não exclui. Reflete os cargos de liderança operacional
//   do dia a dia (Gestor/Gerente/Supervisor): já alteram dado rotineiramente, mas excluir é uma
//   ação mais destrutiva/rara, por isso fica fora deste nível.
// - TOTAL: as 5 ações liberadas — hoje, só o perfil Administrador.
export const ACCESS_LEVEL_TO_MODULE_FLAGS: Record<AccessLevel, ModulePermissionFlags> = {
  NENHUM: { canView: false, canExecute: false, canCreate: false, canEdit: false, canDelete: false },
  VISUALIZAR: { canView: true, canExecute: false, canCreate: false, canEdit: false, canDelete: false },
  EXECUTAR: { canView: true, canExecute: true, canCreate: false, canEdit: false, canDelete: false },
  EDITAR: { canView: true, canExecute: true, canCreate: true, canEdit: true, canDelete: false },
  TOTAL: { canView: true, canExecute: true, canCreate: true, canEdit: true, canDelete: true },
};

// Perfil de permissão padrão para cada cargo (Role) — fonte única usada em dois lugares que
// precisam concordar entre si:
// 1. `prisma/seed.ts`, para atribuir automaticamente um desses perfis a qualquer usuário sem
//    `permissionProfileId` (roda só quando o seed é executado manualmente).
// 2. `resolveDefaultPermissionProfileId` em `@/lib/authz`, chamada pelas rotas
//    POST/PATCH `/api/usuarios` sempre que o formulário de usuário deixa "Perfil de permissão"
//    em branco — depois da correção do fail-open em `hasModulePermission` (usuário sem perfil
//    atribuído fica sem acesso a nenhum módulo operacional), nenhum usuário criado/editado pela
//    tela pode ficar sem perfil de verdade, então o backend sempre resolve um perfil padrão a
//    partir do cargo escolhido em vez de aceitar `permissionProfileId` vazio.
export const ROLE_TO_PERMISSION_PROFILE_KEY: Record<string, string> = {
  ADMINISTRADOR: "administrador",
  GESTOR: "gestor",
  GERENTE: "gerente",
  SUPERVISOR: "supervisor",
  COLABORADOR: "funcionario",
};

export function defaultProfileKeyForRole(role: Role | string): string {
  return ROLE_TO_PERMISSION_PROFILE_KEY[role as string] ?? "funcionario";
}

// Perfis de permissão cujo `key` espelha 1:1 um valor do enum Role — derivado por inversão do
// mapa acima para as duas direções nunca ficarem incoerentes entre si. Os perfis "lider",
// "marketing" e "financeiro" são perfis funcionais sem Role equivalente no enum (atribuídos
// manualmente na tela de Permissões, não por cargo), então não entram neste mapa.
const PERMISSION_PROFILE_KEY_TO_ROLE: Partial<Record<string, Role>> = Object.fromEntries(
  Object.entries(ROLE_TO_PERMISSION_PROFILE_KEY).map(([role, key]) => [key, role as Role])
);

// Nível de acesso padrão de um perfil de permissão (PermissionProfile.key), usado para gerar as
// flags de ModulePermission no seed. Reaproveita defaultLevelForRole(): perfis sem Role
// equivalente (lider/marketing/financeiro) caem no cargo "COLABORADOR" — o mesmo nível mais
// conservador (VISUALIZAR) que o caso "default" da função já usa para qualquer cargo não listado
// explicitamente — já que nenhum cargo declara um nível maior para eles.
export function defaultLevelForProfileKey(profileKey: string): "VISUALIZAR" | "EDITAR" | "TOTAL" {
  const role = PERMISSION_PROFILE_KEY_TO_ROLE[profileKey] ?? "COLABORADOR";
  return defaultLevelForRole(role);
}
