"use client";

import { useMemo, useRef, useState } from "react";
import { format } from "date-fns";
import { CheckCircle2, Circle, EyeOff, Upload, ArrowDownCircle, ArrowUpCircle } from "lucide-react";
import { StatCard, Section, Badge } from "@/components/ui/stat-card";
import { Modal, FormError } from "@/components/ui/modal";
import { Toolbar } from "@/components/ui/toolbar";
import { formatCurrency } from "@/lib/calc";
import { apiRequest } from "@/lib/api-client";

type TransactionDTO = {
  id: string;
  date: string;
  descricao: string;
  direction: "ENTRADA" | "SAIDA";
  valor: number;
  status: "PENDENTE" | "CONCILIADO" | "IGNORADO";
  observacoes: string | null;
  bankAccountName: string;
  importFileName: string;
};

const STATUS_LABEL: Record<string, string> = {
  PENDENTE: "Pendente",
  CONCILIADO: "Conciliado",
  IGNORADO: "Ignorado",
};

const STATUS_TONE: Record<string, "default" | "success" | "warning" | "danger" | "info"> = {
  PENDENTE: "warning",
  CONCILIADO: "success",
  IGNORADO: "default",
};

export function ConciliacaoClient({
  accounts,
  initialTransactions,
  canImport = true,
}: {
  accounts: { id: string; name: string; bank: string | null }[];
  initialTransactions: TransactionDTO[];
  canImport?: boolean;
}) {
  const [transactions, setTransactions] = useState(initialTransactions);
  const [filterAccount, setFilterAccount] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [showImport, setShowImport] = useState(false);
  const [importAccountId, setImportAccountId] = useState(accounts[0]?.id ?? "");
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<{ imported: number; errors: string[] } | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(
    () =>
      transactions.filter((t) => {
        if (filterAccount && t.bankAccountName !== accounts.find((a) => a.id === filterAccount)?.name) return false;
        if (filterStatus && t.status !== filterStatus) return false;
        return true;
      }),
    [transactions, filterAccount, filterStatus, accounts]
  );

  const summary = useMemo(() => {
    const totalEntradas = filtered.filter((t) => t.direction === "ENTRADA").reduce((s, t) => s + t.valor, 0);
    const totalSaidas = filtered.filter((t) => t.direction === "SAIDA").reduce((s, t) => s + t.valor, 0);
    const pendentes = filtered.filter((t) => t.status === "PENDENTE").length;
    return { totalEntradas, totalSaidas, saldo: totalEntradas - totalSaidas, pendentes };
  }, [filtered]);

  async function refresh() {
    const params = new URLSearchParams();
    if (filterAccount) params.set("bankAccountId", filterAccount);
    if (filterStatus) params.set("status", filterStatus);
    const res = await fetch(`/api/financeiro/conciliacao?${params.toString()}`);
    const data = await res.json();
    setTransactions(
      (data.transactions ?? []).map((t: { id: string; date: string; descricao: string; direction: string; valor: number; status: string; observacoes: string | null; bankAccount: { name: string }; import: { fileName: string } }) => ({
        id: t.id,
        date: t.date,
        descricao: t.descricao,
        direction: t.direction,
        valor: t.valor,
        status: t.status,
        observacoes: t.observacoes,
        bankAccountName: t.bankAccount.name,
        importFileName: t.import.fileName,
      }))
    );
  }

  async function setStatus(id: string, status: string) {
    setRowError(null);
    const result = await apiRequest(`/api/financeiro/conciliacao/${id}`, "PATCH", { status });
    if (!result.ok) {
      setRowError(result.error);
      return;
    }
    refresh();
  }

  function openImport() {
    setImportError(null);
    setImportResult(null);
    setImportAccountId(accounts[0]?.id ?? "");
    setShowImport(true);
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!importAccountId) {
      setImportError("Selecione a conta bancária do extrato.");
      return;
    }
    setImportError(null);
    setImportResult(null);
    setImporting(true);
    const formData = new FormData();
    formData.append("file", file);
    formData.append("bankAccountId", importAccountId);
    try {
      const res = await fetch("/api/financeiro/conciliacao/import", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) {
        setImportError(data?.error ?? "Erro ao importar o extrato.");
      } else {
        setImportResult({ imported: data.imported, errors: data.errors ?? [] });
        refresh();
      }
    } catch {
      setImportError("Falha de conexão. Tente novamente.");
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard label="Entradas" value={formatCurrency(summary.totalEntradas)} icon="ArrowDownCircle" color="#3FB68B" />
        <StatCard label="Saídas" value={formatCurrency(summary.totalSaidas)} icon="ArrowUpCircle" color="#E5534B" />
        <StatCard label="Saldo do período" value={formatCurrency(summary.saldo)} icon="Scale" color="#1464F4" />
        <StatCard label="Pendentes de conciliar" value={String(summary.pendentes)} icon="ListChecks" color="#E8A33D" />
      </div>

      <Section
        title="Extrato Bancário"
        action={
          <Toolbar
            filters={
              <>
                <select
                  value={filterAccount}
                  onChange={(e) => setFilterAccount(e.target.value)}
                  className="input !w-auto"
                >
                  <option value="">Todas as contas</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  className="input !w-auto"
                >
                  <option value="">Todos os status</option>
                  <option value="PENDENTE">Pendente</option>
                  <option value="CONCILIADO">Conciliado</option>
                  <option value="IGNORADO">Ignorado</option>
                </select>
              </>
            }
            exportFilename="conciliacao-bancaria"
            exportSheetName="Extrato"
            exportRows={() =>
              filtered.map((t) => ({
                Data: format(new Date(t.date), "dd/MM/yyyy"),
                Descrição: t.descricao,
                Conta: t.bankAccountName,
                Tipo: t.direction === "ENTRADA" ? "Entrada" : "Saída",
                Valor: t.valor,
                Status: STATUS_LABEL[t.status],
              }))
            }
            onRefresh={refresh}
            onAdd={canImport ? openImport : undefined}
            addLabel="Importar extrato"
          />
        }
      >
        {!canImport && (
          <p className="mb-4 text-xs text-amber-400 bg-amber-950/20 border border-amber-900/40 rounded-lg px-3 py-2">
            Você está no modo Grupo Nord (consolidado). Selecione uma loja específica no menu lateral para importar
            e conciliar o extrato bancário.
          </p>
        )}
        <FormError message={rowError} />

        {filtered.length === 0 ? (
          <p className="text-sm text-nord-gray py-8 text-center">
            Nenhum lançamento encontrado. Importe um extrato bancário para começar a conciliação.
          </p>
        ) : (
          <div className="overflow-x-auto nord-scrollbar">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-nord-gray border-b border-nord-border">
                  <th className="py-2 pr-4 font-medium">Data</th>
                  <th className="py-2 pr-4 font-medium">Descrição</th>
                  <th className="py-2 pr-4 font-medium">Conta</th>
                  <th className="py-2 pr-4 font-medium text-right">Valor</th>
                  <th className="py-2 pr-4 font-medium">Status</th>
                  <th className="py-2 pr-4 font-medium text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((t) => (
                  <tr key={t.id} className="border-b border-nord-border/60 last:border-0">
                    <td className="py-2.5 pr-4 text-nord-gray whitespace-nowrap">{format(new Date(t.date), "dd/MM/yyyy")}</td>
                    <td className="py-2.5 pr-4 text-white">{t.descricao}</td>
                    <td className="py-2.5 pr-4 text-nord-gray whitespace-nowrap">{t.bankAccountName}</td>
                    <td
                      className={`py-2.5 pr-4 text-right font-medium whitespace-nowrap ${
                        t.direction === "ENTRADA" ? "text-nord-success" : "text-nord-danger"
                      }`}
                    >
                      {t.direction === "ENTRADA" ? (
                        <ArrowDownCircle size={12} className="inline mb-0.5 mr-1" />
                      ) : (
                        <ArrowUpCircle size={12} className="inline mb-0.5 mr-1" />
                      )}
                      {formatCurrency(t.valor)}
                    </td>
                    <td className="py-2.5 pr-4">
                      <Badge tone={STATUS_TONE[t.status]}>{STATUS_LABEL[t.status]}</Badge>
                    </td>
                    <td className="py-2.5 pr-4">
                      <div className="flex items-center justify-end gap-1.5">
                        {t.status !== "CONCILIADO" && (
                          <button
                            onClick={() => setStatus(t.id, "CONCILIADO")}
                            title="Marcar como conciliado"
                            className="p-1.5 rounded-md text-nord-gray hover:text-nord-success hover:bg-nord-success/10"
                          >
                            <CheckCircle2 size={14} />
                          </button>
                        )}
                        {t.status !== "PENDENTE" && (
                          <button
                            onClick={() => setStatus(t.id, "PENDENTE")}
                            title="Marcar como pendente"
                            className="p-1.5 rounded-md text-nord-gray hover:text-nord-warning hover:bg-nord-warning/10"
                          >
                            <Circle size={14} />
                          </button>
                        )}
                        {t.status !== "IGNORADO" && (
                          <button
                            onClick={() => setStatus(t.id, "IGNORADO")}
                            title="Ignorar lançamento"
                            className="p-1.5 rounded-md text-nord-gray hover:text-white hover:bg-white/10"
                          >
                            <EyeOff size={14} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Modal open={showImport} onClose={() => setShowImport(false)} title="Importar extrato bancário">
        <FormError message={importError} />
        {importResult && (
          <div className="mb-3 p-3 rounded-lg bg-nord-success/10 border border-nord-success/30">
            <p className="text-xs text-nord-success">{importResult.imported} lançamento(s) importado(s) com sucesso.</p>
            {importResult.errors.length > 0 && (
              <ul className="mt-2 text-xs text-nord-warning list-disc pl-4 space-y-0.5">
                {importResult.errors.slice(0, 10).map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
                {importResult.errors.length > 10 && <li>+{importResult.errors.length - 10} outro(s) erro(s)</li>}
              </ul>
            )}
          </div>
        )}
        <label className="block mb-3">
          <span className="block text-xs text-nord-gray mb-1">Conta bancária</span>
          <select value={importAccountId} onChange={(e) => setImportAccountId(e.target.value)} className="input">
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} {a.bank ? `— ${a.bank}` : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="block mb-1">
          <span className="block text-xs text-nord-gray mb-1">Arquivo do extrato (CSV ou XLSX)</span>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.txt,.xlsx"
            onChange={handleFileChange}
            disabled={importing}
            className="input"
          />
        </label>
        <p className="text-xs text-nord-gray mt-2">
          O arquivo deve conter colunas de <strong>data</strong>, <strong>descrição</strong> e <strong>valor</strong>{" "}
          (valores negativos são lançados como saída) — ou colunas separadas de <strong>entrada</strong> /{" "}
          <strong>saída</strong>.
        </p>
        {importing && (
          <p className="mt-3 text-xs text-nord-blue-light flex items-center gap-1.5">
            <Upload size={12} className="animate-pulse" /> Importando extrato...
          </p>
        )}
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
    </div>
  );
}
