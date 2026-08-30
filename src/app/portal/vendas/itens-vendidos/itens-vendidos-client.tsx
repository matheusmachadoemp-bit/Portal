"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Upload } from "lucide-react";
import { Section, Badge } from "@/components/ui/stat-card";
import { Modal } from "@/components/ui/modal";
import { formatCurrency, formatNumber } from "@/lib/calc";
import { buildCurvaAbc, type AbcClass } from "@/lib/vendas-analytics";

type Row = { nome: string; quantidade: number; faturamento: number; margem: number };
type Criterio = "quantidade" | "faturamento" | "margem";

const CRITERIO_LABEL: Record<Criterio, string> = { quantidade: "Quantidade", faturamento: "Faturamento", margem: "Margem" };
const CLASS_TONE: Record<AbcClass, "success" | "info" | "default"> = { A: "success", B: "info", C: "default" };

export function ItensVendidosClient({ rows, canCreate = true }: { rows: Row[]; canCreate?: boolean }) {
  const router = useRouter();
  const [criterio, setCriterio] = useState<Criterio>("faturamento");
  const [showImport, setShowImport] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importLoading, setImportLoading] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<{ itens: number; faturamentoTotal: number; comProduto: number } | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  const curva = useMemo(() => buildCurvaAbc(rows.map((r) => ({ ...r, value: r[criterio] }))), [rows, criterio]);

  const counts = { A: curva.filter((r) => r.classe === "A").length, B: curva.filter((r) => r.classe === "B").length, C: curva.filter((r) => r.classe === "C").length };

  function openImport() {
    setImportFile(null);
    setImportError(null);
    setImportResult(null);
    setShowImport(true);
  }

  async function submitImport() {
    if (!importFile) {
      setImportError("Selecione um arquivo .xlsx antes de importar.");
      return;
    }
    setImportLoading(true);
    setImportError(null);
    setImportResult(null);
    try {
      const body = new FormData();
      body.append("file", importFile);
      const res = await fetch("/api/vendas/importar-itens", { method: "POST", body });
      const data = await res.json();
      if (!res.ok) {
        setImportError(data.error ?? "Não foi possível importar o arquivo.");
        return;
      }
      setImportResult({ itens: data.itens, faturamentoTotal: data.faturamentoTotal, comProduto: data.comProduto });
      setImportFile(null);
      if (importInputRef.current) importInputRef.current.value = "";
      router.refresh();
    } catch {
      setImportError("Falha ao enviar o arquivo. Verifique sua conexão e tente novamente.");
    } finally {
      setImportLoading(false);
    }
  }

  return (
    <Section
      title="Curva ABC (últimos 30 dias)"
      action={
        <div className="flex items-center gap-2">
          {canCreate && (
            <button
              onClick={openImport}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs border border-nord-border text-nord-gray hover:text-white"
            >
              <Upload size={13} /> Importar arquivo
            </button>
          )}
          <div className="flex gap-1.5">
            {(Object.keys(CRITERIO_LABEL) as Criterio[]).map((c) => (
              <button
                key={c}
                onClick={() => setCriterio(c)}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-medium ${criterio === c ? "bg-nord-blue text-white" : "bg-nord-panel text-nord-gray hover:text-white"}`}
              >
                {CRITERIO_LABEL[c]}
              </button>
            ))}
          </div>
        </div>
      }
    >
      <div className="flex items-center gap-3 mb-4 text-xs text-nord-gray">
        <span className="flex items-center gap-1"><Badge tone="success">A</Badge> {counts.A} produtos</span>
        <span className="flex items-center gap-1"><Badge tone="info">B</Badge> {counts.B} produtos</span>
        <span className="flex items-center gap-1"><Badge tone="default">C</Badge> {counts.C} produtos</span>
      </div>
      <div className="overflow-x-auto nord-scrollbar">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-nord-gray border-b border-nord-border">
              <th className="py-2 pr-4">Produto</th>
              <th className="py-2 pr-4">Quantidade</th>
              <th className="py-2 pr-4">Faturamento</th>
              <th className="py-2 pr-4">Margem</th>
              <th className="py-2 pr-4">Participação</th>
              <th className="py-2 pr-4">Acumulado</th>
              <th className="py-2 pr-4">Classe</th>
            </tr>
          </thead>
          <tbody>
            {curva.map((r) => (
              <tr key={r.nome} className="border-b border-nord-border/50 hover:bg-white/5">
                <td className="py-2.5 pr-4 text-white">{r.nome}</td>
                <td className="py-2.5 pr-4 text-nord-gray">{formatNumber(r.quantidade)}</td>
                <td className="py-2.5 pr-4 text-nord-gray">{formatCurrency(r.faturamento)}</td>
                <td className="py-2.5 pr-4 text-nord-gray">{formatCurrency(r.margem)}</td>
                <td className="py-2.5 pr-4 text-nord-gray">{r.participacaoPercent.toFixed(1)}%</td>
                <td className="py-2.5 pr-4 text-nord-gray">{r.participacaoAcumuladaPercent.toFixed(1)}%</td>
                <td className="py-2.5 pr-4">
                  <Badge tone={CLASS_TONE[r.classe]}>{r.classe}</Badge>
                </td>
              </tr>
            ))}
            {curva.length === 0 && (
              <tr>
                <td colSpan={7} className="py-6 text-center text-nord-gray">
                  Nenhum item vendido lançado nos últimos 30 dias. Lance vendas em Vendas → Lançamentos ou importe um arquivo.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal open={showImport} onClose={() => setShowImport(false)} title="Importar arquivo de itens vendidos">
        <div className="space-y-3 text-sm text-nord-gray">
          <p>
            No Saipos, gere o relatório <span className="text-white">&quot;Itens Vendidos&quot;</span> (Itens e
            Opções) para o período desejado e envie o arquivo aqui (.xlsx).
          </p>
          <div className="bg-nord-panel border border-nord-border rounded-lg px-3 py-2 text-xs space-y-1.5">
            <p>
              O sistema separa automaticamente os produtos de verdade das opções gratuitas do cardápio (ex.:
              &quot;sem borda&quot;, &quot;com açúcar&quot;), que não entram na contagem. Sabores e variações
              aparecem com o nome da categoria na frente (ex.: &quot;Pizza Salgada - Calabresa&quot;) para não
              misturar com sabores de mesmo nome em categorias diferentes.
            </p>
            <p>
              Se você já importou esse mesmo período antes, os dados são{" "}
              <span className="text-white">substituídos</span> pelos do novo arquivo.
            </p>
          </div>
          <label className="block">
            <span className="block text-xs text-nord-gray mb-1">Arquivo (.xlsx)</span>
            <input
              ref={importInputRef}
              type="file"
              accept=".xlsx,.xls"
              onChange={(e) => setImportFile(e.target.files?.[0] ?? null)}
              className="input"
            />
          </label>
          {importError && <p className="text-xs text-red-400">{importError}</p>}
          {importResult && (
            <div className="text-xs bg-emerald-950/20 border border-emerald-900/40 rounded-lg px-3 py-2 text-emerald-300 space-y-1">
              <p>
                Importação concluída: {importResult.itens} item(ns), somando {formatCurrency(importResult.faturamentoTotal)}.
              </p>
              <p className="text-nord-gray">
                {importResult.comProduto} de {importResult.itens} itens foram reconhecidos como produtos já
                cadastrados em Ficha Técnica (para cálculo de margem).
              </p>
            </div>
          )}
        </div>
        <button
          onClick={submitImport}
          disabled={importLoading || !importFile}
          className="w-full mt-4 bg-nord-blue hover:bg-nord-blue-light disabled:opacity-50 text-white text-sm font-medium rounded-lg py-2.5"
        >
          {importLoading ? "Importando..." : "Importar"}
        </button>
      </Modal>

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
      `}</style>
    </Section>
  );
}
