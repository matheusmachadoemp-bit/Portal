"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Upload } from "lucide-react";
import { Modal } from "@/components/ui/modal";

export function ClientesImportButton({ canCreate = true }: { canCreate?: boolean }) {
  const router = useRouter();
  const [showImport, setShowImport] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importLoading, setImportLoading] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<{
    created: number;
    updated: number;
    errors: string[];
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
      setImportError("Selecione um arquivo .csv ou .xlsx antes de importar.");
      return;
    }
    setImportLoading(true);
    setImportError(null);
    setImportResult(null);
    try {
      const body = new FormData();
      body.append("file", importFile);
      const res = await fetch("/api/crm/clientes/import", { method: "POST", body });
      const data = await res.json();
      if (!res.ok) {
        setImportError(data.error ?? "Não foi possível importar o arquivo.");
        return;
      }
      setImportResult({ created: data.created, updated: data.updated, errors: data.errors ?? [] });
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
        className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border border-nord-border text-nord-gray hover:text-white"
      >
        <Upload size={13} /> Importar clientes
      </button>

      <Modal open={showImport} onClose={() => setShowImport(false)} title="Importar clientes">
        <div className="space-y-3 text-sm text-nord-gray">
          <p>
            Envie uma planilha (.csv ou .xlsx) com os clientes. A única coluna obrigatória é{" "}
            <span className="text-white">&quot;Nome&quot;</span> — as demais são opcionais: Telefone, WhatsApp,
            E-mail, Data de nascimento, Endereço, Bairro, Cidade.
          </p>
          <div className="bg-nord-panel border border-nord-border rounded-lg px-3 py-2 text-xs space-y-1.5">
            <p>
              Clientes existentes são identificados pelo <span className="text-white">telefone</span>: se já houver
              um cadastro com o mesmo telefone, ele é atualizado em vez de duplicado. Sem telefone, um novo cadastro
              é sempre criado.
            </p>
            <p>
              Também aceita colunas de pedidos, em dois formatos: uma linha por pedido (Número do pedido, O que
              pediu, Valor gasto) ou totais agregados por cliente, como em exportações de outros sistemas (Qtd.
              Pedidos, Valor Total, Ticket Médio, Última Compra). Em ambos os casos, esses dados aparecem só como
              contexto no perfil do cliente — não entram nos relatórios de Vendas nem no cálculo de VIP/status do
              CRM, que seguem baseados só em vendas reais do sistema.
            </p>
          </div>
          <label className="block">
            <span className="block text-xs text-nord-gray mb-1">Arquivo (.csv ou .xlsx)</span>
            <input
              ref={importInputRef}
              type="file"
              accept=".csv,.xlsx,.xls"
              onChange={(e) => setImportFile(e.target.files?.[0] ?? null)}
              className="input"
            />
          </label>
          {importError && <p className="text-xs text-red-400">{importError}</p>}
          {importResult && (
            <div className="text-xs bg-emerald-950/20 border border-emerald-900/40 rounded-lg px-3 py-2 text-emerald-300 space-y-1">
              <p>
                Importação concluída: {importResult.created} novo(s), {importResult.updated} atualizado(s).
              </p>
              {importResult.errors.length > 0 && (
                <div className="text-amber-300">
                  <p>{importResult.errors.length} linha(s) com problema:</p>
                  <ul className="list-disc list-inside">
                    {importResult.errors.slice(0, 5).map((e, i) => (
                      <li key={i}>{e}</li>
                    ))}
                  </ul>
                  {importResult.errors.length > 5 && <p>e mais {importResult.errors.length - 5}...</p>}
                </div>
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
    </>
  );
}
