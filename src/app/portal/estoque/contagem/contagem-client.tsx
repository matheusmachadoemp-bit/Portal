"use client";

import { useState } from "react";
import { ContagemSemanalClient } from "../contagem-semanal/contagem-semanal-client";
import { ContagemMensalClient } from "../contagem-mensal/contagem-mensal-client";

type SemanalRow = Parameters<typeof ContagemSemanalClient>[0]["initialCounts"][number];
type MensalRow = Parameters<typeof ContagemMensalClient>[0]["initialCounts"][number];

const TABS = [
  { key: "semanal", label: "Semanal" },
  { key: "mensal", label: "Mensal" },
] as const;

export function ContagemClient({
  initialSemanais,
  initialMensais,
  canCreate,
  userRole,
}: {
  initialSemanais: SemanalRow[];
  initialMensais: MensalRow[];
  canCreate: boolean;
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
        <ContagemSemanalClient initialCounts={initialSemanais} canCreate={canCreate} />
      ) : (
        <ContagemMensalClient initialCounts={initialMensais} canCreate={canCreate} userRole={userRole} />
      )}
    </div>
  );
}
