"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Cake, Megaphone } from "lucide-react";
import { Badge, Section } from "@/components/ui/stat-card";
import { formatCurrency, formatNumber } from "@/lib/calc";
import { STATUS_LABEL, STATUS_TONE, type ClienteStatus } from "@/lib/crm";

type Row = {
  id: string;
  nome: string;
  dataNascimento: string;
  diasAte: number;
  lojaNome: string;
  lojaColor: string;
  totalGasto: number;
  pedidos: number;
  status: ClienteStatus;
};

const TABS = [
  { key: "hoje", label: "Hoje" },
  { key: "7dias", label: "Próximos 7 dias" },
  { key: "mes", label: "Este mês" },
] as const;

export function AniversariantesClient({ rows, isGrupo }: { rows: Row[]; isGrupo: boolean }) {
  const router = useRouter();
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("hoje");

  const hoje = rows.filter((r) => r.diasAte === 0);
  const proximos7 = rows.filter((r) => r.diasAte <= 7);
  const esteMes = rows.filter((r) => r.diasAte <= 31);

  const filtered = tab === "hoje" ? hoje : tab === "7dias" ? proximos7 : esteMes;

  const criarCampanha = useMemo(
    () => () => {
      const ids = filtered.map((r) => r.id);
      if (ids.length === 0) return;
      router.push(`/portal/crm/campanhas/novo?clientes=${ids.join(",")}`);
    },
    [filtered, router]
  );

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`nord-card p-4 text-left transition ${tab === t.key ? "border-nord-blue" : "hover:border-nord-blue/40"}`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs text-nord-gray">{t.label}</span>
              <Cake size={16} className="text-nord-blue-light" />
            </div>
            <p className="text-white text-2xl font-semibold mt-2">
              {formatNumber(t.key === "hoje" ? hoje.length : t.key === "7dias" ? proximos7.length : esteMes.length)}
            </p>
          </button>
        ))}
      </div>

      <Section
        title={`Aniversariantes — ${TABS.find((t) => t.key === tab)!.label}`}
        action={
          filtered.length > 0 && (
            <button onClick={criarCampanha} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-nord-blue hover:bg-nord-blue-light text-white">
              <Megaphone size={13} /> Criar campanha de aniversário
            </button>
          )
        }
      >
        <div className="overflow-x-auto nord-scrollbar">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-nord-gray border-b border-nord-border">
                <th className="py-2 pr-4">Cliente</th>
                <th className="py-2 pr-4">Data</th>
                {isGrupo && <th className="py-2 pr-4">Loja</th>}
                <th className="py-2 pr-4">Total gasto</th>
                <th className="py-2 pr-4">Pedidos</th>
                <th className="py-2 pr-4">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} className="border-b border-nord-border/50 hover:bg-white/5">
                  <td className="py-2.5 pr-4 text-white">{r.nome}</td>
                  <td className="py-2.5 pr-4 text-nord-gray">
                    {new Date(r.dataNascimento + "T00:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}
                    {r.diasAte === 0 && <span className="text-emerald-400"> · hoje!</span>}
                  </td>
                  {isGrupo && (
                    <td className="py-2.5 pr-4">
                      <span className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: `${r.lojaColor}22`, color: r.lojaColor }}>
                        {r.lojaNome}
                      </span>
                    </td>
                  )}
                  <td className="py-2.5 pr-4 text-nord-gray">{formatCurrency(r.totalGasto)}</td>
                  <td className="py-2.5 pr-4 text-nord-gray">{r.pedidos}</td>
                  <td className="py-2.5 pr-4">
                    <Badge tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</Badge>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={isGrupo ? 6 : 5} className="py-8 text-center text-nord-gray">
                    Nenhum aniversariante neste período.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  );
}
