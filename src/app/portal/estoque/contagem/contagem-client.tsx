"use client";

import { useState } from "react";
import { ContagemSemanalClient } from "../contagem-semanal/contagem-semanal-client";
import { ContagemMensalClient } from "../contagem-mensal/contagem-mensal-client";

type SemanalRow = Parameters<typeof ContagemSemanalClient>[0]["initialCounts"][number];
type MensalRow = Parameters<typeof ContagemMensalClient>[0]["initialCounts"][number];
type EmployeeOption = Parameters<typeof ContagemMensalClient>[0]["employees"][number];

const TABS = [
  { key: "semanal", label: "Semanal" },
  { key: "mensal", label: "Mensal" },
] as const;

type UserOption = { id: string; name: string };

export function ContagemClient({
  initialSemanais,
  initialMensais,
  employees,
  setores,
  users,
  canCreate,
  canEdit,
  canDelete,
  canCreateAgenda,
  canManageAgenda,
  userRole,
}: {
  initialSemanais: SemanalRow[];
  initialMensais: MensalRow[];
  employees: EmployeeOption[];
  setores: string[];
  users: UserOption[];
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canCreateAgenda: boolean;
  canManageAgenda: boolean;
  userRole: string;
}) {
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("semanal");

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium ${
              tab === t.key ? "bg-nord-blue text-white" : "bg-nord-panel border border-nord-border text-nord-gray hover:text-white"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "semanal" ? (
        <ContagemSemanalClient
          initialCounts={initialSemanais}
          employees={employees}
          setores={setores}
          users={users}
          canCreate={canCreate}
          canEdit={canEdit}
          canDelete={canDelete}
          canCreateAgenda={canCreateAgenda}
          canManageAgenda={canManageAgenda}
        />
      ) : (
        <ContagemMensalClient
          initialCounts={initialMensais}
          employees={employees}
          setores={setores}
          users={users}
          canCreate={canCreate}
          canEdit={canEdit}
          canDelete={canDelete}
          canCreateAgenda={canCreateAgenda}
          canManageAgenda={canManageAgenda}
          userRole={userRole}
        />
      )}
    </div>
  );
}
