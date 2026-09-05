import type { Role } from "@prisma/client";

export const MODULES = [
  { key: "inicio", label: "Início" },
  { key: "vendas", label: "Vendas" },
  { key: "crm", label: "CRM" },
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
