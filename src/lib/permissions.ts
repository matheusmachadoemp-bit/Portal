import type { AccessLevel, Role } from "@prisma/client";

// Espelha o catálogo de módulos do menu lateral (CATEGORIES em prisma/seed.ts / tabela
// Category). Se um módulo novo for criado no menu, ele também precisa ganhar uma entrada aqui —
// caso contrário ele some da tela de Permissões e, pior, some do menu lateral para qualquer
// usuário com um perfil de permissão atribuído (visibleModuleKeys só libera módulos que têm uma
// linha de ModulePermission com canView = true; um módulo ausente daqui nunca ganha essa linha).
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

export type PermissionAction = "canView" | "canCreate" | "canEdit" | "canDelete";
export const PERMISSION_ACTIONS: { key: PermissionAction; label: string }[] = [
  { key: "canView", label: "Ver" },
  { key: "canCreate", label: "Criar" },
  { key: "canEdit", label: "Editar" },
  { key: "canDelete", label: "Excluir" },
];

/** Módulos visíveis no menu para um usuário, dado seu perfil de permissão. Administradores sempre veem tudo. */
export function visibleModuleKeys(
  role: Role | string,
  modulePermissions: { moduleKey: string; canView: boolean }[] | undefined
): Set<string> | null {
  if (role === "ADMINISTRADOR") return null; // null = sem restrição, mostra tudo
  if (!modulePermissions) return null; // sem perfil atribuído: comportamento atual (mostra tudo)
  return new Set(modulePermissions.filter((m) => m.canView).map((m) => m.moduleKey));
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
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
};

// Mapeamento entre AccessLevel e as 4 flags de ModulePermission (Ver/Criar/Editar/Excluir).
//
// Por que este mapeamento e não outro: `defaultLevelForRole()` não varia por módulo — ela recebe
// só o cargo (Role) e devolve um único nível aplicado a todos os módulos igualmente (não há
// parâmetro de módulo na assinatura da função), então um mapeamento AccessLevel -> flags também
// único (não por módulo) é consistente com a única fonte da verdade que já existe. Os níveis são
// cumulativos, cada um incluindo as permissões do nível anterior, na mesma ordem em que já são
// exibidos como colunas na tela de Permissões (Ver, Criar, Editar, Excluir):
// - NENHUM: nenhuma ação liberada (não é produzido por defaultLevelForRole() hoje, mas mapeado
//   aqui para o enum ficar completo).
// - VISUALIZAR: só enxerga a tela — era o único nível com efeito real até esta tarefa (controla
//   a visibilidade do módulo no menu lateral).
// - EDITAR: vê, cria e edita, mas não exclui. Reflete os cargos de liderança operacional do dia a
//   dia (Gestor/Gerente/Supervisor): já alteram dado rotineiramente, mas excluir é uma ação mais
//   destrutiva/rara, por isso fica fora deste nível.
// - TOTAL: as 4 ações liberadas — hoje, só o perfil Administrador.
export const ACCESS_LEVEL_TO_MODULE_FLAGS: Record<AccessLevel, ModulePermissionFlags> = {
  NENHUM: { canView: false, canCreate: false, canEdit: false, canDelete: false },
  VISUALIZAR: { canView: true, canCreate: false, canEdit: false, canDelete: false },
  EDITAR: { canView: true, canCreate: true, canEdit: true, canDelete: false },
  TOTAL: { canView: true, canCreate: true, canEdit: true, canDelete: true },
};

// Perfis de permissão cujo `key` espelha 1:1 um valor do enum Role — ver roleToProfileKey em
// prisma/seed.ts, que atribui automaticamente um desses perfis a um usuário sem perfil, a partir
// do cargo (Role) dele. Os perfis "lider", "marketing" e "financeiro" são perfis funcionais sem
// Role equivalente no enum (atribuídos manualmente na tela de Permissões, não por cargo), então
// não entram neste mapa.
const PERMISSION_PROFILE_KEY_TO_ROLE: Partial<Record<string, Role>> = {
  administrador: "ADMINISTRADOR",
  gestor: "GESTOR",
  gerente: "GERENTE",
  supervisor: "SUPERVISOR",
  funcionario: "COLABORADOR",
};

// Nível de acesso padrão de um perfil de permissão (PermissionProfile.key), usado para gerar as
// flags de ModulePermission no seed. Reaproveita defaultLevelForRole(): perfis sem Role
// equivalente (lider/marketing/financeiro) caem no cargo "COLABORADOR" — o mesmo nível mais
// conservador (VISUALIZAR) que o caso "default" da função já usa para qualquer cargo não listado
// explicitamente — já que nenhum cargo declara um nível maior para eles.
export function defaultLevelForProfileKey(profileKey: string): "VISUALIZAR" | "EDITAR" | "TOTAL" {
  const role = PERMISSION_PROFILE_KEY_TO_ROLE[profileKey] ?? "COLABORADOR";
  return defaultLevelForRole(role);
}
