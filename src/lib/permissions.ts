import type { Role } from "@prisma/client";

export const MODULES = [
  { key: "inicio", label: "Início" },
  { key: "vendas", label: "Vendas" },
  { key: "marketing", label: "Marketing" },
  { key: "universidade", label: "Universidade Grupo Nord" },
  { key: "metas", label: "Metas" },
  { key: "rh", label: "RH" },
  { key: "financeiro", label: "Financeiro" },
  { key: "administrativo", label: "Administrativo" },
  { key: "ficha-tecnica", label: "Ficha Técnica" },
  { key: "configuracoes", label: "Configurações" },
  { key: "usuarios", label: "Usuários" },
] as const;

export type ModuleKey = (typeof MODULES)[number]["key"];

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
