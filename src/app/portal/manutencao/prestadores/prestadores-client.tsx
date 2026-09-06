"use client";

import { useMemo, useState } from "react";
import { Star } from "lucide-react";
import { Section, Badge } from "@/components/ui/stat-card";
import { Toolbar } from "@/components/ui/toolbar";
import { formatCurrency } from "@/lib/calc";
import { PrestadorFormModal } from "../prestador-form-modal";
import type { PrestadorDTO } from "../types";

type EmpresaOption = { id: string; name: string };

export function PrestadoresClient({
  initialPrestadores,
  canManage,
  empresas,
}: {
  initialPrestadores: PrestadorDTO[];
  canManage: boolean;
  empresas: EmpresaOption[];
}) {
  const [prestadores, setPrestadores] = useState(initialPrestadores);
  const [q, setQ] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<PrestadorDTO | null>(null);

  async function refresh() {
    const res = await fetch("/api/manutencao/prestadores");
    const data = await res.json();
    setPrestadores(data.prestadores);
  }

  const filtered = useMemo(() => {
    return prestadores.filter((p) => {
      if (!showInactive && !p.active) return false;
      if (q) {
        const needle = q.toLowerCase();
        const haystack = `${p.nome} ${p.especialidade ?? ""} ${p.documento ?? ""}`.toLowerCase();
        if (!haystack.includes(needle)) return false;
      }
      return true;
    });
  }, [prestadores, q, showInactive]);

  function openEdit(p: PrestadorDTO) {
    setEditing(p);
    setShowModal(true);
  }

  return (
    <Section
      title="Prestadores"
      action={
        <Toolbar
          filters={
            <>
              <input className="input w-56" placeholder="Buscar por nome, especialidade..." value={q} onChange={(e) => setQ(e.target.value)} />
              <label className="flex items-center gap-1.5 text-xs text-nord-gray">
                <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
                Mostrar inativos
              </label>
            </>
          }
          exportFilename="prestadores"
          exportSheetName="Prestadores"
          exportRows={() =>
            filtered.map((p) => ({
              Nome: p.nome,
              Especialidade: p.especialidade ?? "",
              Telefone: p.telefone ?? "",
              "E-mail": p.email ?? "",
              "Serviços realizados": p._count?.registros ?? 0,
              "Valor total gasto": p.valorTotalGasto ?? 0,
              Status: p.active ? "Ativo" : "Inativo",
            }))
          }
          onRefresh={refresh}
          onAdd={
            canManage
              ? () => {
                  setEditing(null);
                  setShowModal(true);
                }
              : undefined
          }
          addLabel="Novo prestador"
        />
      }
    >
      <div className="overflow-x-auto nord-scrollbar">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-nord-gray border-b border-nord-border">
              <th className="py-2 pr-4">Nome</th>
              <th className="py-2 pr-4">Especialidade</th>
              <th className="py-2 pr-4">Contato</th>
              <th className="py-2 pr-4">Avaliação</th>
              <th className="py-2 pr-4">Serviços</th>
              <th className="py-2 pr-4">Valor gasto</th>
              <th className="py-2 pr-4">Status</th>
              <th className="py-2 pr-4" />
            </tr>
          </thead>
          <tbody>
            {filtered.map((p) => (
              <tr key={p.id} className="border-b border-nord-border/50 hover:bg-white/5">
                <td className="py-2.5 pr-4 text-white">{p.nome}</td>
                <td className="py-2.5 pr-4 text-nord-gray">{p.especialidade ?? "—"}</td>
                <td className="py-2.5 pr-4 text-nord-gray">{p.telefone ?? p.whatsapp ?? p.email ?? "—"}</td>
                <td className="py-2.5 pr-4">
                  {p.avaliacao ? (
                    <span className="inline-flex items-center gap-1 text-amber-400">
                      <Star size={12} fill="currentColor" /> {p.avaliacao}
                    </span>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="py-2.5 pr-4 text-white">{p._count?.registros ?? 0}</td>
                <td className="py-2.5 pr-4 text-white">{formatCurrency(p.valorTotalGasto ?? 0)}</td>
                <td className="py-2.5 pr-4">
                  <Badge tone={p.active ? "success" : "default"}>{p.active ? "Ativo" : "Inativo"}</Badge>
                </td>
                <td className="py-2.5 pr-4 text-right">
                  {canManage && (
                    <button onClick={() => openEdit(p)} className="text-xs text-nord-blue-light hover:underline">
                      Editar
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={8} className="py-6 text-center text-nord-gray">
                  Nenhum prestador cadastrado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <PrestadorFormModal
        open={showModal}
        onClose={() => setShowModal(false)}
        prestador={editing}
        empresas={empresas}
        onSaved={() => {
          setShowModal(false);
          refresh();
        }}
      />
    </Section>
  );
}
