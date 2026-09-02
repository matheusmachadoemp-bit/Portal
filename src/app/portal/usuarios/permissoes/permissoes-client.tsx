"use client";

import { useMemo, useState } from "react";
import { Check } from "lucide-react";
import { Section } from "@/components/ui/stat-card";
import { DynamicIcon } from "@/components/dynamic-icon";
import { PERMISSION_ACTIONS, type PermissionAction } from "@/lib/permissions";

type ModulePermissionDTO = { moduleKey: string; canView: boolean; canCreate: boolean; canEdit: boolean; canDelete: boolean };
type ProfileDTO = { id: string; name: string; modulePermissions: ModulePermissionDTO[] };

const PROFILE_ICON: Record<string, string> = {
  Administrador: "ShieldCheck",
  Gestor: "Briefcase",
  Supervisor: "UserCog",
  Gerente: "UserCircle",
  Líder: "Star",
  Funcionário: "User",
  Marketing: "Megaphone",
  Financeiro: "DollarSign",
};

export function PermissoesClient({
  initialProfiles,
  modules,
}: {
  initialProfiles: ProfileDTO[];
  modules: readonly { key: string; label: string }[];
}) {
  const [profiles, setProfiles] = useState(initialProfiles);
  const [activeId, setActiveId] = useState(initialProfiles[0]?.id ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const active = profiles.find((p) => p.id === activeId);

  const matrix = useMemo(() => {
    const byModule = new Map(active?.modulePermissions.map((m) => [m.moduleKey, m]));
    return modules.map((mod) => byModule.get(mod.key) ?? { moduleKey: mod.key, canView: false, canCreate: false, canEdit: false, canDelete: false });
  }, [active, modules]);

  function updateCell(moduleKey: string, action: PermissionAction, value: boolean) {
    setSaved(false);
    setProfiles((prev) =>
      prev.map((p) => {
        if (p.id !== activeId) return p;
        const exists = p.modulePermissions.some((m) => m.moduleKey === moduleKey);
        const next = exists
          ? p.modulePermissions.map((m) => (m.moduleKey === moduleKey ? { ...m, [action]: value } : m))
          : [...p.modulePermissions, { moduleKey, canView: false, canCreate: false, canEdit: false, canDelete: false, [action]: value }];
        return { ...p, modulePermissions: next };
      })
    );
  }

  function toggleColumn(action: PermissionAction, value: boolean) {
    setSaved(false);
    setProfiles((prev) =>
      prev.map((p) => {
        if (p.id !== activeId) return p;
        const byModule = new Map(p.modulePermissions.map((m) => [m.moduleKey, m]));
        const next = modules.map((mod) => ({
          ...(byModule.get(mod.key) ?? { moduleKey: mod.key, canView: false, canCreate: false, canEdit: false, canDelete: false }),
          [action]: value,
        }));
        return { ...p, modulePermissions: next };
      })
    );
  }

  function toggleRow(moduleKey: string, value: boolean) {
    setSaved(false);
    setProfiles((prev) =>
      prev.map((p) => {
        if (p.id !== activeId) return p;
        const byModule = new Map(p.modulePermissions.map((m) => [m.moduleKey, m]));
        const next = modules.map((mod) =>
          mod.key === moduleKey
            ? { moduleKey, canView: value, canCreate: value, canEdit: value, canDelete: value }
            : (byModule.get(mod.key) ?? { moduleKey: mod.key, canView: false, canCreate: false, canEdit: false, canDelete: false })
        );
        return { ...p, modulePermissions: next };
      })
    );
  }

  function selectAllProfile(value: boolean) {
    setSaved(false);
    setProfiles((prev) =>
      prev.map((p) =>
        p.id === activeId
          ? { ...p, modulePermissions: modules.map((mod) => ({ moduleKey: mod.key, canView: value, canCreate: value, canEdit: value, canDelete: value })) }
          : p
      )
    );
  }

  async function save() {
    if (!active) return;
    setSaving(true);
    await fetch(`/api/permissoes/${active.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ modulePermissions: matrix }),
    });
    setSaving(false);
    setSaved(true);
  }

  return (
    <div className="space-y-6">
      <p className="text-xs text-nord-gray bg-nord-panel border border-nord-border rounded-lg px-3 py-2">
        Hoje a permissão <strong className="text-white">Ver</strong> controla a visibilidade do módulo no menu
        lateral. As colunas Criar/Editar/Excluir ficam registradas para uso futuro nas ações de cada tela.
      </p>

      <div className="flex gap-2 flex-wrap">
        {profiles.map((p) => (
          <button
            key={p.id}
            onClick={() => setActiveId(p.id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap ${
              activeId === p.id ? "bg-nord-blue text-white" : "border border-nord-border text-nord-blue-light hover:text-white"
            }`}
          >
            <DynamicIcon name={PROFILE_ICON[p.name] ?? "User"} size={13} />
            {p.name}
          </button>
        ))}
      </div>

      <Section
        title={active ? `Permissões — ${active.name}` : "Permissões"}
        action={
          <div className="flex items-center gap-2">
            <button onClick={() => selectAllProfile(true)} className="text-xs text-nord-blue-light hover:text-white">
              Selecionar tudo
            </button>
            <button onClick={() => selectAllProfile(false)} className="text-xs text-nord-gray hover:text-white">
              Limpar tudo
            </button>
            <button
              onClick={save}
              disabled={saving}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-nord-blue hover:bg-nord-blue-light disabled:opacity-50 text-white font-medium"
            >
              {saving ? "Salvando..." : saved ? <Check size={13} /> : "Salvar"}
            </button>
          </div>
        }
      >
        <div className="overflow-x-auto nord-scrollbar">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-nord-gray border-b border-nord-border">
                <th className="py-2 pr-4">Módulo</th>
                {PERMISSION_ACTIONS.map((a) => (
                  <th key={a.key} className="py-2 pr-4 text-center">
                    <div className="flex flex-col items-center gap-1">
                      <span>{a.label}</span>
                      <input
                        type="checkbox"
                        className="accent-nord-blue"
                        checked={matrix.every((m) => m[a.key])}
                        onChange={(e) => toggleColumn(a.key, e.target.checked)}
                      />
                    </div>
                  </th>
                ))}
                <th className="py-2 pr-4 text-center">Tudo</th>
              </tr>
            </thead>
            <tbody>
              {modules.map((mod) => {
                const row = matrix.find((m) => m.moduleKey === mod.key)!;
                return (
                  <tr key={mod.key} className="border-b border-nord-border/50 hover:bg-white/5">
                    <td className="py-2.5 pr-4 text-white">{mod.label}</td>
                    {PERMISSION_ACTIONS.map((a) => (
                      <td key={a.key} className="py-2.5 pr-4 text-center">
                        <input
                          type="checkbox"
                          className="accent-nord-blue"
                          checked={row[a.key]}
                          onChange={(e) => updateCell(mod.key, a.key, e.target.checked)}
                        />
                      </td>
                    ))}
                    <td className="py-2.5 pr-4 text-center">
                      <input
                        type="checkbox"
                        className="accent-nord-blue"
                        checked={row.canView && row.canCreate && row.canEdit && row.canDelete}
                        onChange={(e) => toggleRow(mod.key, e.target.checked)}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  );
}
