"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus, Pencil, Trash2, ShieldCheck, Eye, EyeOff, ChevronDown, ChevronRight } from "lucide-react";
import { Section, Badge } from "@/components/ui/stat-card";
import { Modal, ConfirmDialog } from "@/components/ui/modal";
import { format } from "date-fns";

type UserDTO = {
  id: string;
  name: string;
  email: string;
  role: string;
  active: boolean;
  phone: string | null;
  lastLoginAt: string | null;
  createdAt: string;
  permissions: { moduleKey: string; level: string }[];
  empresaIds: string[];
  canViewGrupoNord: boolean;
  defaultEmpresaId: string | null;
  permissionProfileId: string | null;
};

const ROLES = ["ADMINISTRADOR", "GESTOR", "GERENTE", "SUPERVISOR", "COLABORADOR"];
const ROLE_TONE: Record<string, "default" | "success" | "warning" | "danger" | "info"> = {
  ADMINISTRADOR: "danger",
  GESTOR: "info",
  GERENTE: "info",
  SUPERVISOR: "warning",
  COLABORADOR: "default",
};

const emptyForm = {
  name: "",
  email: "",
  password: "",
  role: "COLABORADOR",
  phone: "",
  active: true,
  canViewGrupoNord: false,
  defaultEmpresaId: "",
  permissionProfileId: "",
};

export function UsuariosClient({
  initialUsers,
  modules,
  currentUserId,
  currentUserRole,
  empresas,
  profiles,
}: {
  initialUsers: UserDTO[];
  modules: readonly { key: string; label: string; subcategories?: { key: string; label: string }[] }[];
  currentUserId: string;
  currentUserRole: string;
  empresas: { id: string; name: string }[];
  profiles: { id: string; name: string }[];
}) {
  const availableRoles = currentUserRole === "ADMINISTRADOR" ? ROLES : ROLES.filter((r) => r !== "ADMINISTRADOR");
  const [users, setUsers] = useState(initialUsers);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<UserDTO | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [permissions, setPermissions] = useState<Record<string, string>>({});
  const [expandedModules, setExpandedModules] = useState<Record<string, boolean>>({});
  const [empresaIds, setEmpresaIds] = useState<string[]>([]);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [showFormPassword, setShowFormPassword] = useState(false);

  function setPermission(key: string, level: string) {
    setPermissions((p) => ({ ...p, [key]: level }));
  }

  function clearPermission(key: string) {
    setPermissions((p) => {
      const next = { ...p };
      delete next[key];
      return next;
    });
  }

  function toggleEmpresa(id: string) {
    setEmpresaIds((prev) => (prev.includes(id) ? prev.filter((e) => e !== id) : [...prev, id]));
  }

  async function refresh() {
    const res = await fetch("/api/usuarios");
    const data = await res.json();
    setUsers(data.users);
  }

  function openNew() {
    setEditing(null);
    setForm(emptyForm);
    setPermissions({});
    setExpandedModules({});
    setEmpresaIds([]);
    setShowFormPassword(false);
    setFormError(null);
    setShowForm(true);
  }

  function openEdit(u: UserDTO) {
    setFormError(null);
    setEditing(u);
    setForm({
      name: u.name,
      email: u.email,
      password: "",
      role: u.role,
      phone: u.phone ?? "",
      active: u.active,
      canViewGrupoNord: u.canViewGrupoNord,
      defaultEmpresaId: u.defaultEmpresaId ?? "",
      permissionProfileId: u.permissionProfileId ?? "",
    });
    const perm: Record<string, string> = {};
    u.permissions.forEach((p) => (perm[p.moduleKey] = p.level));
    setPermissions(perm);
    const expanded: Record<string, boolean> = {};
    u.permissions.forEach((p) => {
      const [moduleKey, subKey] = p.moduleKey.split(":");
      if (subKey) expanded[moduleKey] = true;
    });
    setExpandedModules(expanded);
    setEmpresaIds(u.empresaIds);
    setShowFormPassword(false);
    setShowForm(true);
  }

  async function submit() {
    setFormError(null);
    const payload = {
      ...form,
      defaultEmpresaId: form.defaultEmpresaId || empresaIds[0] || null,
      permissions: Object.entries(permissions).map(([moduleKey, level]) => ({ moduleKey, level })),
      empresaIds,
    };
    const res = editing
      ? await fetch(`/api/usuarios/${editing.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        })
      : await fetch("/api/usuarios", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setFormError(data?.error ?? "Não foi possível salvar o usuário.");
      return;
    }

    setShowForm(false);
    refresh();
  }

  async function doDelete() {
    if (!confirmDeleteId) return;
    await fetch(`/api/usuarios/${confirmDeleteId}`, { method: "DELETE" });
    setConfirmDeleteId(null);
    refresh();
  }

  return (
    <Section
      title="Usuários do portal"
      action={
        <div className="flex items-center gap-2">
          <Link
            href="/portal/usuarios/permissoes"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border border-nord-border text-nord-gray hover:text-white"
          >
            <ShieldCheck size={13} /> Perfis de permissão
          </Link>
          <button
            onClick={openNew}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-nord-blue hover:bg-nord-blue-light text-white font-medium"
          >
            <Plus size={13} /> Novo usuário
          </button>
        </div>
      }
    >
      <div className="overflow-x-auto nord-scrollbar">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-nord-gray border-b border-nord-border">
              <th className="py-2 pr-4">Nome</th>
              <th className="py-2 pr-4">E-mail</th>
              <th className="py-2 pr-4">Nível</th>
              <th className="py-2 pr-4">Status</th>
              <th className="py-2 pr-4">Último acesso</th>
              <th className="py-2 pr-4"></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b border-nord-border/50 hover:bg-white/5">
                <td className="py-2.5 pr-4 text-white">{u.name}</td>
                <td className="py-2.5 pr-4 text-nord-gray">{u.email}</td>
                <td className="py-2.5 pr-4">
                  <Badge tone={ROLE_TONE[u.role]}>{u.role}</Badge>
                </td>
                <td className="py-2.5 pr-4">
                  <Badge tone={u.active ? "success" : "danger"}>{u.active ? "Ativo" : "Inativo"}</Badge>
                </td>
                <td className="py-2.5 pr-4 text-nord-gray">
                  {u.lastLoginAt ? format(new Date(u.lastLoginAt), "dd/MM/yyyy HH:mm") : "Nunca acessou"}
                </td>
                <td className="py-2.5 pr-4">
                  <div className="flex items-center gap-2 justify-end">
                    <button onClick={() => openEdit(u)} className="text-nord-gray hover:text-white">
                      <Pencil size={14} />
                    </button>
                    {u.id !== currentUserId && (
                      <button onClick={() => setConfirmDeleteId(u.id)} className="text-nord-gray hover:text-red-400">
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal open={showForm} onClose={() => setShowForm(false)} title={editing ? "Editar usuário" : "Novo usuário"} widthClass="max-w-xl">
        {formError && <p className="text-xs text-nord-danger mb-3">{formError}</p>}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Nome">
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="input" />
          </Field>
          <Field label="E-mail">
            <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="input" />
          </Field>
          <Field label={editing ? "Nova senha (opcional)" : "Senha inicial"}>
            <div className="relative">
              <input
                type={showFormPassword ? "text" : "password"}
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                className="input pr-8"
                placeholder={editing ? "Deixe em branco para manter a atual" : "Defina uma senha inicial"}
              />
              <button
                type="button"
                onClick={() => setShowFormPassword((v) => !v)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-nord-gray hover:text-white"
                tabIndex={-1}
              >
                {showFormPassword ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </Field>
          <Field label="Telefone">
            <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="input" />
          </Field>
          <Field label="Nível de acesso">
            <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} className="input">
              {availableRoles.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Status">
            <select
              value={form.active ? "1" : "0"}
              onChange={(e) => setForm({ ...form, active: e.target.value === "1" })}
              className="input"
            >
              <option value="1">Ativo</option>
              <option value="0">Inativo</option>
            </select>
          </Field>
          <Field label="Perfil de permissão">
            <select
              value={form.permissionProfileId}
              onChange={(e) => setForm({ ...form, permissionProfileId: e.target.value })}
              className="input"
            >
              <option value="">— nenhum selecionado (usa o perfil padrão do Nível de acesso) —</option>
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
        </div>

        {form.role !== "ADMINISTRADOR" && form.role !== "GESTOR" && (
          <div className="mt-5">
            <h4 className="text-sm text-white font-medium mb-2">Acesso às lojas</h4>
            <div className="grid grid-cols-2 gap-2">
              {empresas.map((e) => (
                <label
                  key={e.id}
                  className="flex items-center gap-2 bg-nord-panel border border-nord-border rounded-lg px-3 py-2 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={empresaIds.includes(e.id)}
                    onChange={() => toggleEmpresa(e.id)}
                    className="accent-nord-blue"
                  />
                  <span className="text-xs text-nord-gray">{e.name}</span>
                </label>
              ))}
            </div>
            {empresaIds.length > 0 && (
              <div className="mt-2">
                <Field label="Loja padrão ao entrar">
                  <select
                    value={form.defaultEmpresaId}
                    onChange={(e) => setForm({ ...form, defaultEmpresaId: e.target.value })}
                    className="input"
                  >
                    <option value="">Primeira loja com acesso</option>
                    {empresas
                      .filter((e) => empresaIds.includes(e.id))
                      .map((e) => (
                        <option key={e.id} value={e.id}>
                          {e.name}
                        </option>
                      ))}
                  </select>
                </Field>
              </div>
            )}
            <label className="flex items-center gap-2 mt-2">
              <input
                type="checkbox"
                checked={form.canViewGrupoNord}
                onChange={(e) => setForm({ ...form, canViewGrupoNord: e.target.checked })}
                className="accent-nord-blue"
              />
              <span className="text-xs text-nord-gray">
                Pode visualizar o Grupo Nord (consolidado entre lojas)
              </span>
            </label>
          </div>
        )}

        {form.role !== "ADMINISTRADOR" && (
          <div className="mt-5">
            <h4 className="text-sm text-white font-medium mb-1">Permissões personalizadas por módulo</h4>
            <p className="text-[11px] text-nord-gray mb-2">
              Deixe em branco para seguir o perfil de permissão. Ajuste aqui só o que precisa ser diferente para
              este usuário — inclusive por subcategoria, clicando na seta para abrir a lista de telas do módulo.
            </p>
            <div className="grid grid-cols-2 gap-2">
              {modules.map((m) => {
                const subs = m.subcategories ?? [];
                const expanded = !!expandedModules[m.key];
                return (
                  <div key={m.key} className="bg-nord-panel border border-nord-border rounded-lg px-3 py-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1 min-w-0">
                        {subs.length > 0 && (
                          <button
                            type="button"
                            onClick={() => setExpandedModules((e) => ({ ...e, [m.key]: !e[m.key] }))}
                            className="text-nord-gray hover:text-white shrink-0"
                          >
                            {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                          </button>
                        )}
                        <span className="text-xs text-nord-gray truncate">{m.label}</span>
                      </div>
                      <select
                        value={permissions[m.key] ?? "VISUALIZAR"}
                        onChange={(e) => setPermission(m.key, e.target.value)}
                        className="perm-select bg-transparent text-xs text-white outline-none shrink-0"
                      >
                        <option value="NENHUM">Sem acesso</option>
                        <option value="VISUALIZAR">Visualizar</option>
                        <option value="EDITAR">Editar</option>
                        <option value="TOTAL">Total</option>
                      </select>
                    </div>
                    {expanded && subs.length > 0 && (
                      <div className="mt-2 pl-4 space-y-1.5 border-l border-nord-border">
                        {subs.map((sub) => {
                          const key = `${m.key}:${sub.key}`;
                          return (
                            <div key={key} className="flex items-center justify-between gap-2">
                              <span className="text-[11px] text-nord-gray truncate">{sub.label}</span>
                              <select
                                value={permissions[key] ?? ""}
                                onChange={(e) =>
                                  e.target.value ? setPermission(key, e.target.value) : clearPermission(key)
                                }
                                className="perm-select bg-transparent text-[11px] text-white outline-none shrink-0"
                              >
                                <option value="">Igual à categoria</option>
                                <option value="NENHUM">Sem acesso</option>
                                <option value="VISUALIZAR">Visualizar</option>
                                <option value="EDITAR">Editar</option>
                                <option value="TOTAL">Total</option>
                              </select>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <button onClick={submit} className="w-full mt-4 bg-nord-blue hover:bg-nord-blue-light text-white text-sm font-medium rounded-lg py-2.5">
          Salvar usuário
        </button>
      </Modal>

      <ConfirmDialog
        open={!!confirmDeleteId}
        title="Excluir usuário"
        message="Tem certeza que deseja excluir este usuário? Ele perderá acesso ao portal imediatamente."
        onConfirm={doDelete}
        onCancel={() => setConfirmDeleteId(null)}
        confirmLabel="Excluir"
        danger
      />

      <style jsx global>{`
        .input {
          width: 100%;
          background: var(--nord-panel);
          border: 1px solid var(--nord-border);
          border-radius: 8px;
          padding: 8px 12px;
          color: white;
          font-size: 13px;
          outline: none;
        }
        .input:focus {
          border-color: var(--nord-blue);
        }
        .perm-select {
          color-scheme: dark;
        }
      `}</style>
    </Section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs text-nord-gray mb-1">{label}</span>
      {children}
    </label>
  );
}
