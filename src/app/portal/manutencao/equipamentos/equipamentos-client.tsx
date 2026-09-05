"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Section, Badge } from "@/components/ui/stat-card";
import { Toolbar } from "@/components/ui/toolbar";
import { EQUIPAMENTO_STATUS_LABEL, EQUIPAMENTO_STATUS_TONE } from "@/lib/manutencao";
import { EquipamentoFormModal } from "../equipamento-form-modal";
import type { EquipamentoDTO } from "../types";

export function EquipamentosClient({ initialEquipamentos, canCreate }: { initialEquipamentos: EquipamentoDTO[]; canCreate: boolean }) {
  const [equipamentos, setEquipamentos] = useState(initialEquipamentos);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [showModal, setShowModal] = useState(false);
  const router = useRouter();

  async function refresh() {
    const res = await fetch("/api/manutencao/equipamentos");
    const data = await res.json();
    setEquipamentos(data.equipamentos);
  }

  const filtered = useMemo(() => {
    return equipamentos.filter((e) => {
      if (statusFilter && e.status !== statusFilter) return false;
      if (q) {
        const needle = q.toLowerCase();
        const haystack = `${e.nome} ${e.codigo} ${e.marca ?? ""} ${e.modelo ?? ""} ${e.numeroSerie ?? ""}`.toLowerCase();
        if (!haystack.includes(needle)) return false;
      }
      return true;
    });
  }, [equipamentos, q, statusFilter]);

  return (
    <Section
      title="Equipamentos"
      action={
        <Toolbar
          filters={
            <>
              <input className="input w-56" placeholder="Buscar por nome, código, marca..." value={q} onChange={(e) => setQ(e.target.value)} />
              <select className="input w-44" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                <option value="">Todos os status</option>
                {Object.entries(EQUIPAMENTO_STATUS_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </>
          }
          exportFilename="equipamentos"
          exportSheetName="Equipamentos"
          exportRows={() =>
            filtered.map((e) => ({
              Código: e.codigo,
              Nome: e.nome,
              Loja: e.empresa.name,
              Setor: e.setor,
              Categoria: e.categoria,
              Marca: e.marca ?? "",
              Modelo: e.modelo ?? "",
              Status: EQUIPAMENTO_STATUS_LABEL[e.status] ?? e.status,
              Chamados: e._count?.chamados ?? 0,
            }))
          }
          onRefresh={refresh}
          onAdd={canCreate ? () => setShowModal(true) : undefined}
          addLabel="Novo equipamento"
        />
      }
    >
      <div className="overflow-x-auto nord-scrollbar">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-nord-gray border-b border-nord-border">
              <th className="py-2 pr-4">Código</th>
              <th className="py-2 pr-4">Nome</th>
              <th className="py-2 pr-4">Loja</th>
              <th className="py-2 pr-4">Setor</th>
              <th className="py-2 pr-4">Categoria</th>
              <th className="py-2 pr-4">Status</th>
              <th className="py-2 pr-4">Chamados</th>
              <th className="py-2 pr-4" />
            </tr>
          </thead>
          <tbody>
            {filtered.map((e) => (
              <tr key={e.id} className="border-b border-nord-border/50 hover:bg-white/5">
                <td className="py-2.5 pr-4 text-white font-mono text-xs">{e.codigo}</td>
                <td className="py-2.5 pr-4 text-white">{e.nome}</td>
                <td className="py-2.5 pr-4 text-white">{e.empresa.name}</td>
                <td className="py-2.5 pr-4 text-white">{e.setor}</td>
                <td className="py-2.5 pr-4 text-white">{e.categoria}</td>
                <td className="py-2.5 pr-4">
                  <Badge tone={EQUIPAMENTO_STATUS_TONE[e.status]}>{EQUIPAMENTO_STATUS_LABEL[e.status] ?? e.status}</Badge>
                </td>
                <td className="py-2.5 pr-4 text-white">{e._count?.chamados ?? 0}</td>
                <td className="py-2.5 pr-4 text-right">
                  <Link href={`/portal/manutencao/equipamentos/${e.id}`} className="text-xs text-nord-blue-light hover:underline">
                    Abrir ficha
                  </Link>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={8} className="py-6 text-center text-nord-gray">
                  Nenhum equipamento encontrado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <EquipamentoFormModal
        open={showModal}
        onClose={() => setShowModal(false)}
        onSaved={() => {
          setShowModal(false);
          refresh();
          router.refresh();
        }}
      />
    </Section>
  );
}
