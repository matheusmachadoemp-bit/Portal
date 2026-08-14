"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Section, Badge, StatCard } from "@/components/ui/stat-card";
import { Toolbar } from "@/components/ui/toolbar";
import { formatCurrency, formatPercent } from "@/lib/calc";

type Row = {
  id: string;
  name: string;
  code: string;
  category: string;
  categoryLabel: string;
  precoVenda: number;
  totalCost: number;
  cmv: number;
  margem: number;
  ingredientesCount: number;
  subKey: string;
};

const CMV_ALERTA = 35;

export function FichasTecnicasClient({ rows }: { rows: Row[] }) {
  const [categoryFilter, setCategoryFilter] = useState("");
  const categories = useMemo(() => [...new Set(rows.map((r) => r.category))], [rows]);

  const filtered = useMemo(() => rows.filter((r) => !categoryFilter || r.category === categoryFilter), [rows, categoryFilter]);
  const semFicha = filtered.filter((r) => r.ingredientesCount === 0);
  const acimaDoAlerta = filtered.filter((r) => r.cmv > CMV_ALERTA);

  return (
    <div className="space-y-6">
      <p className="text-xs text-nord-gray bg-nord-panel border border-nord-border rounded-lg px-3 py-2">
        As fichas técnicas completas (ingredientes, modo de preparo, rendimento) são cadastradas no módulo{" "}
        <Link href="/portal/ficha-tecnica" className="text-nord-blue-light hover:underline">Ficha Técnica</Link>. Esta tela conecta cada
        item do cardápio ao seu custo e CMV teórico calculados a partir do estoque.
      </p>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Itens no cardápio" value={String(rows.length)} icon="ClipboardList" />
        <StatCard label="Sem ficha técnica" value={String(semFicha.length)} icon="ClipboardX" color={semFicha.length ? "#ef4444" : "#22c55e"} />
        <StatCard label={`CMV acima de ${CMV_ALERTA}%`} value={String(acimaDoAlerta.length)} icon="TriangleAlert" color={acimaDoAlerta.length ? "#f59e0b" : "#22c55e"} />
        <StatCard label="CMV médio do cardápio" value={formatPercent(filtered.length ? filtered.reduce((s, r) => s + r.cmv, 0) / filtered.length : 0)} icon="Calculator" />
      </div>

      <Section
        title="Itens do cardápio"
        action={
          <Toolbar
            filters={
              <select className="input w-56" value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
                <option value="">Todas as categorias</option>
                {categories.map((c) => (
                  <option key={c} value={c}>{rows.find((r) => r.category === c)?.categoryLabel}</option>
                ))}
              </select>
            }
            exportFilename="fichas-tecnicas"
            exportSheetName="Fichas Técnicas"
            exportRows={() =>
              filtered.map((r) => ({
                Produto: r.name,
                Categoria: r.categoryLabel,
                "Preço de venda": r.precoVenda,
                "Custo total": r.totalCost,
                "CMV %": r.cmv,
                "Margem de contribuição": r.margem,
              }))
            }
          />
        }
      >
        <div className="overflow-x-auto nord-scrollbar">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-nord-gray border-b border-nord-border">
                <th className="py-2 pr-4">Produto</th>
                <th className="py-2 pr-4">Categoria</th>
                <th className="py-2 pr-4">Preço de venda</th>
                <th className="py-2 pr-4">Custo total</th>
                <th className="py-2 pr-4">CMV teórico</th>
                <th className="py-2 pr-4">Margem</th>
                <th className="py-2 pr-4" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} className="border-b border-nord-border/50 hover:bg-white/5">
                  <td className="py-2.5 pr-4 text-white">{r.name}</td>
                  <td className="py-2.5 pr-4 text-nord-gray">{r.categoryLabel}</td>
                  <td className="py-2.5 pr-4 text-nord-gray">{formatCurrency(r.precoVenda)}</td>
                  <td className="py-2.5 pr-4 text-nord-gray">{formatCurrency(r.totalCost)}</td>
                  <td className="py-2.5 pr-4">
                    {r.ingredientesCount === 0 ? (
                      <Badge tone="danger">Sem ficha</Badge>
                    ) : (
                      <Badge tone={r.cmv > CMV_ALERTA ? "danger" : r.cmv > 28 ? "warning" : "success"}>{formatPercent(r.cmv)}</Badge>
                    )}
                  </td>
                  <td className="py-2.5 pr-4 text-nord-gray">{formatCurrency(r.margem)}</td>
                  <td className="py-2.5 pr-4 text-right">
                    <Link href={`/portal/ficha-tecnica/${r.subKey}`} className="text-xs text-nord-blue-light hover:underline">
                      Editar ficha
                    </Link>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-6 text-center text-nord-gray">
                    Nenhum item encontrado.
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
