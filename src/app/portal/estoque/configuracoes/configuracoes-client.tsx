"use client";

import { useState } from "react";
import { Section } from "@/components/ui/stat-card";
import Link from "next/link";

type Empresa = { id: string; name: string; metaCmvPercent: number; metaDivergenciaContagemPercent: number };

export function ConfiguracoesEstoqueClient({
  empresas,
  activeEmpresaId,
  canEdit,
}: {
  empresas: Empresa[];
  activeEmpresaId: string | null;
  canEdit: boolean;
}) {
  const activeEmpresa = empresas.find((e) => e.id === activeEmpresaId);
  const [metaCmv, setMetaCmv] = useState(String(activeEmpresa?.metaCmvPercent ?? 30));
  const [divergencia, setDivergencia] = useState(String(activeEmpresa?.metaDivergenciaContagemPercent ?? 3));
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function salvar() {
    setError(null);
    setSaved(false);
    const res = await fetch("/api/estoque/configuracoes", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ metaCmvPercent: metaCmv, metaDivergenciaContagemPercent: divergencia }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.error ?? "Não foi possível salvar as configurações.");
      return;
    }
    setSaved(true);
  }

  return (
    <div className="space-y-6">
      <Section title="Metas de CMV por loja">
        <div className="overflow-x-auto nord-scrollbar">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-nord-gray border-b border-nord-border">
                <th className="py-2 pr-4">Loja</th>
                <th className="py-2 pr-4">Meta de CMV</th>
                <th className="py-2 pr-4">Limiar de divergência de contagem</th>
              </tr>
            </thead>
            <tbody>
              {empresas.map((e) => (
                <tr key={e.id} className="border-b border-nord-border/50">
                  <td className="py-2.5 pr-4 text-white">{e.name}</td>
                  <td className="py-2.5 pr-4 text-nord-gray">{e.metaCmvPercent}%</td>
                  <td className="py-2.5 pr-4 text-nord-gray">{e.metaDivergenciaContagemPercent}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      {canEdit && activeEmpresa && (
        <Section title={`Editar configurações — ${activeEmpresa.name}`}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-lg">
            <label className="block">
              <span className="block text-xs text-nord-gray mb-1">Meta de CMV (%)</span>
              <input className="input" type="number" value={metaCmv} onChange={(e) => setMetaCmv(e.target.value)} />
            </label>
            <label className="block">
              <span className="block text-xs text-nord-gray mb-1">Limiar de divergência de contagem (%)</span>
              <input className="input" type="number" value={divergencia} onChange={(e) => setDivergencia(e.target.value)} />
            </label>
          </div>
          <p className="text-xs text-nord-gray mt-2">
            Divergências de contagem acima deste percentual exigirão justificativa antes da finalização.
          </p>
          {error && <p className="text-xs text-red-400 mt-2">{error}</p>}
          {saved && <p className="text-xs text-emerald-400 mt-2">Configurações salvas.</p>}
          <button onClick={salvar} className="btn-primary mt-4">
            Salvar
          </button>
        </Section>
      )}

      <Section title="Estrutura do módulo">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
          <Link href="/portal/estoque/categorias" className="nord-card p-3 hover:border-nord-blue text-white">
            Gerenciar categorias de produto
          </Link>
          <Link href="/portal/estoque/fornecedores" className="nord-card p-3 hover:border-nord-blue text-white">
            Gerenciar fornecedores
          </Link>
          <Link href="/portal/usuarios/permissoes" className="nord-card p-3 hover:border-nord-blue text-white">
            Permissões de acesso ao módulo Estoque
          </Link>
          <Link href="/portal/configuracoes" className="nord-card p-3 hover:border-nord-blue text-white">
            Integrações e webhooks (Saipos, iFood, 99Food, notas fiscais)
          </Link>
        </div>
      </Section>
    </div>
  );
}
