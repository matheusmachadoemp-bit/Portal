"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Upload } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { format } from "date-fns";

export function GarconsImportButton({ canCreate = true }: { canCreate?: boolean }) {
  const router = useRouter();
  const [showImport, setShowImport] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [periodFrom, setPeriodFrom] = useState(format(new Date(), "yyyy-MM-01"));
  const [periodTo, setPeriodTo] = useState(format(new Date(), "yyyy-MM-dd"));
  const [importLoading, setImportLoading] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<{
    itens: number;
    faturamentoTotal: number;
    garcons: number;
    semGarcomCadastrado: string[];
  } | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  if (!canCreate) return null;

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
    if (!periodFrom || !periodTo) {
      setImportError("Informe a data inicial e final do período do relatório.");
      return;
    }
    setImportLoading(true);
    setImportError(null);
    setImportResult(null);
    try {
      const body = new FormData();
      body.append("file", importFile);
      body.append("periodFrom", periodFrom);
      body.append("periodTo", periodTo);
      const res = await fetch("/api/vendas/importar-garcons", { method: "POST", body });
      const data = await res.json();
      if (!res.ok) {
        setImportError(data.error ?? "Não foi possível importar o arquivo.");
        return;
      }
      setImportResult({
        itens: data.itens,
        faturamentoTotal: data.faturamentoTotal,
        garcons: data.garcons,
        semGarcomCadastrado: data.semGarcomCadastrado ?? [],
      });
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
    <>
      <button
        onClick={openImport}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs border border-nord-border text-nord-gray hover:text-white"
      >
        <Upload size={13} /> Importar arquivo
      </button>

      <Modal open={showImport} onClose={() => setShowImport(false)} title="Importar desempenho por garçom">
        <div className="space-y-3 text-sm text-nord-gray">
          <p>
            No Saipos, gere o relatório <span className="text-white">&quot;Desempenho por garçom&quot;</span> e
            envie o arquivo aqui (.xlsx).
          </p>
          <div className="bg-nord-panel border border-nord-border rounded-lg px-3 py-2 text-xs space-y-1.5">
            <p>
              Esse relatório não traz data — informe abaixo o período que ele cobre. &quot;Total vendido&quot; e
              &quot;Itens vendidos&quot; passam a somar os dados importados; &quot;Mesas atendidas&quot; e
              &quot;Ticket médio&quot; continuam vindo só de vendas lançadas manualmente, porque o relatório não
              separa por mesa/pedido.
            </p>
            <p>
              Se já existir uma importação para o mesmo período, ela é <span className="text-white">substituída</span> pela nova.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="block text-xs text-nord-gray mb-1">Data inicial</span>
              <input type="date" value={periodFrom} onChange={(e) => setPeriodFrom(e.target.value)} className="input" />
            </label>
            <label className="block">
              <span className="block text-xs text-nord-gray mb-1">Data final</span>
              <input type="date" value={periodTo} onChange={(e) => setPeriodTo(e.target.value)} className="input" />
            </label>
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
                Importação concluída: {importResult.itens} linha(s), {importResult.garcons} garçom(s), somando{" "}
                {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(importResult.faturamentoTotal)}.
              </p>
              {importResult.semGarcomCadastrado.length > 0 && (
                <p className="text-amber-300">
                  Não encontrei cadastro em RH para: {importResult.semGarcomCadastrado.join(", ")}. Os dados entram
                  no ranking mesmo assim, pelo nome do arquivo.
                </p>
              )}
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
    </>
  );
}
