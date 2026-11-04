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
    /** Linhas sem telefone/e-mail cujo nome exato já bate com um cliente cadastrado — nunca fundidas
     *  automaticamente (nome sozinho não é identificador forte o bastante), só sinalizadas aqui pra
     *  o usuário conferir manualmente (ver `POST /api/crm/clientes/import`). */
    possibleDuplicates: { line: number; nome: string }[];
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
      setImportResult({
        created: data.created,
        updated: data.updated,
        errors: data.errors ?? [],
        possibleDuplicates: data.possibleDuplicates ?? [],
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
              Clientes existentes são identificados, em ordem: pelo <span className="text-white">telefone</span>;
              sem telefone, pelo <span className="text-white">e-mail</span> (sem diferenciar maiúsculas/minúsculas);
              sem telefone nem e-mail, um cadastro novo é sempre criado — mas se já existir um cliente com o mesmo
              nome, a importação avisa como “possível duplicata” pra você conferir à mão (nome sozinho nunca funde
              automaticamente, já que duas pessoas diferentes podem ter o mesmo nome). Em todos os casos, achar uma
              correspondência atualiza o cadastro em vez de duplicá-lo.
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
          {importError && <p className="text-xs text-nord-danger">{importError}</p>}
          {importResult && (
            <div className="text-xs bg-nord-success/10 border border-nord-success/30 rounded-lg px-3 py-2 text-nord-success space-y-1">
              <p>
                Importação concluída: {importResult.created} novo(s), {importResult.updated} atualizado(s).
              </p>
              {importResult.errors.length > 0 && (
                <div className="text-nord-warning">
                  <p>{importResult.errors.length} linha(s) com problema:</p>
                  <ul className="list-disc list-inside">
                    {importResult.errors.slice(0, 5).map((e, i) => (
                      <li key={i}>{e}</li>
                    ))}
                  </ul>
                  {importResult.errors.length > 5 && <p>e mais {importResult.errors.length - 5}...</p>}
                </div>
              )}
              {importResult.possibleDuplicates.length > 0 && (
                <div className="text-nord-warning">
                  <p>
                    {importResult.possibleDuplicates.length} linha(s) sem telefone/e-mail com o mesmo nome de um
                    cliente já cadastrado — não foram fundidas automaticamente, confira se não é duplicata:
                  </p>
                  <ul className="list-disc list-inside">
                    {importResult.possibleDuplicates.slice(0, 5).map((d, i) => (
                      <li key={i}>
                        Linha {d.line}: {d.nome}
                      </li>
                    ))}
                  </ul>
                  {importResult.possibleDuplicates.length > 5 && (
                    <p>e mais {importResult.possibleDuplicates.length - 5}...</p>
                  )}
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
