"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { spDateKey } from "@/lib/timezone";
import { format } from "date-fns";
import { CheckCircle2, Circle, EyeOff, Upload, ArrowDownCircle, ArrowUpCircle, Wand2, Link2, Landmark, TriangleAlert } from "lucide-react";
import { Section, Badge } from "@/components/ui/stat-card";
import { SortableStatCards } from "@/components/ui/sortable-stat-cards";
import { Modal, FormError } from "@/components/ui/modal";
import { Toolbar } from "@/components/ui/toolbar";
import { formatCurrency } from "@/lib/calc";
import { apiRequest } from "@/lib/api-client";
import { dayMonthTime, formatSince, isBankSyncStale } from "@/lib/relative-time";
import { presetRange, type PeriodPreset } from "@/lib/period-presets";
import { paymentMethodLabel } from "@/lib/bank-labels";

type TransactionDTO = {
  id: string;
  date: string;
  descricao: string;
  direction: "ENTRADA" | "SAIDA";
  valor: number;
  status: "PENDENTE" | "CONCILIADO" | "IGNORADO";
  observacoes: string | null;
  bankAccountId: string;
  bankAccountName: string;
  importFileName: string;
  /** Id do lançamento no banco: preenchido = veio (ou foi confirmado) pela conexão com o banco. */
  externalId: string | null;
  /** Instante exato informado pelo banco (a coluna Data mostra só o dia). */
  occurredAt: string | null;
  counterpart: string | null;
  bankCategory: string | null;
  paymentMethod: string | null;
  /** O banco ainda não compensou este lançamento: não entra na conciliação automática. */
  pendingAtBank: boolean;
  matchedLabel: string | null;
};

type AccountInfo = {
  id: string;
  name: string;
  bank: string | null;
  openFinance: boolean;
  lastSyncAt: string | null;
  bankBalance: number | null;
  bankBalanceAt: string | null;
};

/** Resposta da API (`/api/financeiro/conciliacao`) → o formato usado pela tela. */
function toDto(t: {
  id: string; date: string; descricao: string; direction: "ENTRADA" | "SAIDA"; valor: number;
  status: "PENDENTE" | "CONCILIADO" | "IGNORADO"; observacoes: string | null;
  bankAccountId: string; bankAccount: { name: string }; import: { fileName: string };
  externalId?: string | null; occurredAt?: string | null; counterpart?: string | null; bankCategory?: string | null;
  paymentMethod?: string | null; pendingAtBank?: boolean; matchedLabel: string | null;
}): TransactionDTO {
  return {
    id: t.id,
    date: t.date,
    descricao: t.descricao,
    direction: t.direction,
    valor: t.valor,
    status: t.status,
    observacoes: t.observacoes,
    bankAccountId: t.bankAccountId,
    bankAccountName: t.bankAccount.name,
    importFileName: t.import.fileName,
    externalId: t.externalId ?? null,
    occurredAt: t.occurredAt ?? null,
    counterpart: t.counterpart ?? null,
    bankCategory: t.bankCategory ?? null,
    paymentMethod: t.paymentMethod ?? null,
    pendingAtBank: t.pendingAtBank ?? false,
    matchedLabel: t.matchedLabel,
  };
}

/** Hora do lançamento no fuso de São Paulo (ex.: "23:44"), ou null se o banco não informou. */
function timeOfDay(occurredAt: string | null): string | null {
  if (!occurredAt) return null;
  return new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }).format(new Date(occurredAt));
}

const PAGE_SIZE = 300;

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
  accounts: AccountInfo[];
  initialTransactions: TransactionDTO[];
  canImport?: boolean;
}) {
  const [transactions, setTransactions] = useState(initialTransactions);
  const [filterAccount, setFilterAccount] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterDirection, setFilterDirection] = useState("");
  // Abre em "Este mês" (a página já trouxe só esse mês do servidor).
  const [periodPreset, setPeriodPreset] = useState<PeriodPreset>("thisMonth");
  const [dateFrom, setDateFrom] = useState(() => presetRange("thisMonth").from);
  const [dateTo, setDateTo] = useState(() => presetRange("thisMonth").to);
  // Quantas linhas a tabela mostra; volta para PAGE_SIZE sempre que um filtro muda (a chave muda junto).
  const filterKey = [filterAccount, filterStatus, filterDirection, dateFrom, dateTo].join("|");
  const [shown, setShown] = useState({ key: "", count: PAGE_SIZE });
  const visible = shown.key === filterKey ? shown.count : PAGE_SIZE;
  const [truncated, setTruncated] = useState(false);
  // Ao imprimir, a tabela mostra TODAS as linhas filtradas (não só a página atual) e some o "Mostrar mais".
  const [printing, setPrinting] = useState(false);
  useEffect(() => {
    const before = () => flushSync(() => setPrinting(true));
    const after = () => setPrinting(false);
    window.addEventListener("beforeprint", before);
    window.addEventListener("afterprint", after);
    return () => {
      window.removeEventListener("beforeprint", before);
      window.removeEventListener("afterprint", after);
    };
  }, []);
  // "Agora" só depois de montar (evita diferença entre servidor e navegador no "há X min").
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    const first = setTimeout(() => setNow(new Date()), 0);
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, []);
  const [showImport, setShowImport] = useState(false);
  const [importAccountId, setImportAccountId] = useState(accounts[0]?.id ?? "");
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<{
    imported: number;
    errors: string[];
    detected: string | null;
    ignored: number;
    ignoredSamples: string[];
    totalEntradas: number;
    totalSaidas: number;
    /** Linhas do arquivo que o banco já trouxe (não foram importadas de novo, para não duplicar). */
    skippedCovered: number;
    /** Período do arquivo (dias, "YYYY-MM-DD"), ou null. */
    firstDate: string | null;
    lastDate: string | null;
    /** Conferência de saldos/totais que NÃO bateu (texto de aviso), ou null se tudo certo/sem conferência. */
    checkWarning: string | null;
  } | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);
  const [matching, setMatching] = useState(false);
  const [matchInfo, setMatchInfo] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const refreshSeq = useRef(0);

  const filtered = useMemo(
    () =>
      transactions.filter((t) => {
        if (filterAccount && t.bankAccountId !== filterAccount) return false;
        if (filterStatus && t.status !== filterStatus) return false;
        if (filterDirection && t.direction !== filterDirection) return false;
        if (dateFrom || dateTo) {
          const day = spDateKey(new Date(t.date)); // dia no fuso de São Paulo, igual ao que a tela mostra
          if (dateFrom && day < dateFrom) return false;
          if (dateTo && day > dateTo) return false;
        }
        return true;
      }),
    [transactions, filterAccount, filterStatus, filterDirection, dateFrom, dateTo]
  );

  // Contas ligadas à conexão com o banco (respeita o filtro de conta da tela).
  const linkedAccounts = accounts.filter((a) => a.openFinance && (!filterAccount || a.id === filterAccount));

  const summary = useMemo(() => {
    const totalEntradas = filtered.filter((t) => t.direction === "ENTRADA").reduce((s, t) => s + t.valor, 0);
    const totalSaidas = filtered.filter((t) => t.direction === "SAIDA").reduce((s, t) => s + t.valor, 0);
    const pendentes = filtered.filter((t) => t.status === "PENDENTE").length;
    return { totalEntradas, totalSaidas, saldo: totalEntradas - totalSaidas, pendentes };
  }, [filtered]);

  /** Busca no servidor com os filtros atuais (ou com `overrides`, quando um filtro acabou de mudar e o estado ainda não atualizou). */
  async function refresh(overrides: { direction?: string; from?: string; to?: string } = {}) {
    const direction = overrides.direction ?? filterDirection;
    const from = overrides.from ?? dateFrom;
    const to = overrides.to ?? dateTo;
    // Conta e status são filtrados na própria tela (sem nova busca); o servidor recebe só período e
    // direção. Se a busca também filtrasse conta/status, trocar esses filtros depois deixaria a lista
    // e os totais presos no subconjunto antigo.
    const params = new URLSearchParams();
    if (direction) params.set("direction", direction);
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    const seq = ++refreshSeq.current;
    const res = await fetch(`/api/financeiro/conciliacao?${params.toString()}`);
    const data = await res.json().catch(() => ({}));
    if (seq !== refreshSeq.current) return; // chegou uma busca mais nova (filtros mudados em sequência)
    if (!res.ok) {
      setRowError(data?.error ?? "Não foi possível atualizar o extrato. Tente novamente.");
      return; // mantém a lista atual em vez de esvaziar a tela
    }
    setTruncated(!!data.truncated);
    setTransactions((data.transactions ?? []).map(toDto));
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

  async function autoMatch() {
    setRowError(null);
    setMatchInfo(null);
    setMatching(true);
    const result = await apiRequest<{ matched: number; pending: number }>("/api/financeiro/conciliacao/auto-match", "POST", {
      bankAccountId: filterAccount || undefined,
    });
    setMatching(false);
    if (!result.ok) {
      setRowError(result.error);
      return;
    }
    setMatchInfo(
      result.data.matched > 0
        ? `${result.data.matched} lançamento(s) foram conciliados automaticamente com contas a pagar/receber.`
        : "Nenhuma correspondência automática encontrada entre o extrato e as contas a pagar/receber em aberto."
    );
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
        setImportError(
          [data?.error ?? "Erro ao importar o extrato.", data?.detected ? `Formato reconhecido: ${data.detected}.` : null]
            .filter(Boolean)
            .join(" ")
        );
        if (Array.isArray(data?.errors) && data.errors.length > 0) {
          setImportResult({ imported: 0, errors: data.errors, detected: null, ignored: 0, ignoredSamples: [], totalEntradas: 0, totalSaidas: 0, skippedCovered: 0, firstDate: null, lastDate: null, checkWarning: null });
        }
      } else {
        setImportResult({
          imported: data.imported,
          errors: data.errors ?? [],
          detected: data.detected ?? null,
          ignored: data.ignored ?? 0,
          ignoredSamples: data.ignoredSamples ?? [],
          checkWarning:
            (data.balanceCheck && data.balanceCheck.matched < data.balanceCheck.checked) ||
            (data.totalsCheck && data.totalsCheck.matched === false)
              ? "A conferência automática de saldos/totais NÃO bateu. Confira os lançamentos importados com o seu extrato antes de conciliar."
              : null,
          totalEntradas: data.totalEntradas ?? 0,
          totalSaidas: data.totalSaidas ?? 0,
          skippedCovered: data.skippedCovered ?? 0,
          firstDate: data.firstDate ?? null,
          lastDate: data.lastDate ?? null,
        });
        // O filtro abre em "Este mês": se o arquivo é de outro período, mostra o período do arquivo
        // (senão as linhas importadas "somem" e o usuário importa de novo, duplicando).
        const first: string | undefined = data.firstDate ?? undefined;
        const last: string | undefined = data.lastDate ?? undefined;
        if (first && last && ((dateFrom && first < dateFrom) || (dateTo && last > dateTo))) {
          setPeriodPreset("custom");
          setDateFrom(first);
          setDateTo(last);
          refresh({ from: first, to: last });
        } else {
          refresh();
        }
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
      <SortableStatCards
        storageKey="financeiro-conciliacao-kpi-order"
        className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4"
        cards={[
          { key: "entradas", label: "Entradas", value: formatCurrency(summary.totalEntradas), icon: "ArrowDownCircle", color: "#3FB68B" },
          { key: "saidas", label: "Saídas", value: formatCurrency(summary.totalSaidas), icon: "ArrowUpCircle", color: "#E5534B" },
          { key: "saldo-periodo", label: "Saldo do período", value: formatCurrency(summary.saldo), icon: "Scale", color: "#1464F4" },
          { key: "pendentes", label: "Pendentes de conciliar", value: String(summary.pendentes), icon: "ListChecks", color: "#E8A33D" },
        ]}
      />

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
                <select
                  value={filterDirection}
                  onChange={(e) => {
                    setFilterDirection(e.target.value);
                    refresh({ direction: e.target.value });
                  }}
                  className="input !w-auto"
                  aria-label="Filtrar por entrada ou saída"
                >
                  <option value="">Entradas e saídas</option>
                  <option value="ENTRADA">Só entradas</option>
                  <option value="SAIDA">Só saídas</option>
                </select>
                <select
                  value={periodPreset}
                  onChange={(e) => {
                    const preset = e.target.value as PeriodPreset;
                    setPeriodPreset(preset);
                    if (preset === "custom") return; // espera o usuário escolher as datas
                    const range = presetRange(preset);
                    setDateFrom(range.from);
                    setDateTo(range.to);
                    refresh({ from: range.from, to: range.to });
                  }}
                  className="input !w-auto"
                  aria-label="Filtrar por período"
                >
                  <option value="all">Todo o período</option>
                  <option value="thisMonth">Este mês</option>
                  <option value="lastMonth">Mês passado</option>
                  <option value="last30">Últimos 30 dias</option>
                  <option value="custom">Período personalizado</option>
                </select>
                {periodPreset === "custom" && (
                  <>
                    <label className="flex items-center gap-1.5 text-xs text-nord-gray">
                      De
                      <input
                        type="date"
                        value={dateFrom}
                        max={dateTo || undefined}
                        onChange={(e) => {
                          setDateFrom(e.target.value);
                          refresh({ from: e.target.value });
                        }}
                        className="input !w-auto"
                      />
                    </label>
                    <label className="flex items-center gap-1.5 text-xs text-nord-gray">
                      até
                      <input
                        type="date"
                        value={dateTo}
                        min={dateFrom || undefined}
                        onChange={(e) => {
                          setDateTo(e.target.value);
                          refresh({ to: e.target.value });
                        }}
                        className="input !w-auto"
                      />
                    </label>
                  </>
                )}
                {canImport && (
                  <button onClick={autoMatch} disabled={matching} className="btn-outline">
                    <Wand2 size={13} /> {matching ? "Conciliando..." : "Conciliar automaticamente"}
                  </button>
                )}
              </>
            }
            exportFilename="conciliacao-bancaria"
            exportSheetName="Extrato"
            exportRows={() =>
              filtered.map((t) => ({
                Data: format(new Date(t.date), "dd/MM/yyyy"),
                Descrição: t.descricao,
                Conta: t.bankAccountName,
                Origem: t.externalId ? "Banco" : "Arquivo",
                Contraparte: t.counterpart ?? "",
                Forma: paymentMethodLabel(t.paymentMethod) ?? "",
                Tipo: t.direction === "ENTRADA" ? "Entrada" : "Saída",
                Valor: t.valor,
                Status: STATUS_LABEL[t.status],
                Vínculo: t.matchedLabel ?? "",
              }))
            }
            onRefresh={() => refresh()}
            onAdd={canImport ? openImport : undefined}
            addLabel="Importar extrato"
          />
        }
      >
        {!canImport && (
          <p className="mb-4 text-xs text-nord-warning bg-nord-warning/10 border border-nord-warning/30 rounded-lg px-3 py-2">
            Você está no modo Grupo Nord (consolidado). Selecione uma loja específica no menu lateral para importar
            e conciliar o extrato bancário.
          </p>
        )}
        {linkedAccounts.length > 0 && (
          <div className="mb-4 space-y-2">
            {linkedAccounts.map((a) => {
              const stale = now ? isBankSyncStale(a.lastSyncAt, now) : false;
              return (
                <div
                  key={a.id}
                  className={`flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border px-3 py-2 text-xs ${
                    stale ? "border-nord-warning/30 bg-nord-warning/10" : "border-nord-blue/30 bg-nord-blue/10"
                  }`}
                >
                  <span className="inline-flex items-center gap-1.5 font-medium text-white">
                    <Landmark size={13} className={stale ? "text-nord-warning" : "text-nord-blue-light"} />
                    {a.name}: conectada ao banco
                  </span>
                  <span className="text-nord-gray">
                    Última atualização:{" "}
                    <strong className="text-white">
                      {a.lastSyncAt ? (now ? formatSince(a.lastSyncAt, now) : dayMonthTime(a.lastSyncAt)) : "ainda não houve"}
                    </strong>
                    {a.lastSyncAt && now && <> ({dayMonthTime(a.lastSyncAt)})</>}
                  </span>
                  {a.bankBalance !== null && (
                    <span className="text-nord-gray">
                      Saldo no banco: <strong className="text-white">{formatCurrency(a.bankBalance)}</strong>
                      {a.bankBalanceAt && now && <> ({formatSince(a.bankBalanceAt, now)})</>}
                    </span>
                  )}
                  {stale && (
                    <span className="inline-flex items-center gap-1 text-nord-warning">
                      <TriangleAlert size={12} /> Sem atualização do banco há mais de 1 dia. Confira a conexão.
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
        <FormError message={rowError} />
        {truncated && (
          <p className="mb-4 text-xs text-nord-warning bg-nord-warning/10 border border-nord-warning/30 rounded-lg px-3 py-2">
            O período escolhido tem lançamentos demais para listar de uma vez. A lista mostra os 5.000 mais recentes e os
            totais acima somam só essas linhas. Escolha um período menor para ver tudo.
          </p>
        )}
        {matchInfo && (
          <p className="mb-4 text-xs text-nord-blue-light bg-nord-blue/10 border border-nord-blue/30 rounded-lg px-3 py-2">
            {matchInfo}
          </p>
        )}

        {filtered.length === 0 ? (
          <p className="text-sm text-nord-gray py-8 text-center">
            Nenhum lançamento encontrado neste período. {canImport && "Ajuste o período acima ou importe um extrato bancário."}
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
                  <th className="py-2 pr-4 font-medium">Vínculo</th>
                  <th className="py-2 pr-4 font-medium text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {(printing ? filtered : filtered.slice(0, visible)).map((t) => (
                  <tr key={t.id} className="border-b border-nord-border/60 last:border-0">
                    <td className="py-2.5 pr-4 text-nord-gray whitespace-nowrap">
                      {format(new Date(t.date), "dd/MM/yyyy")}
                      {timeOfDay(t.occurredAt) && <div className="text-[11px] text-nord-gray">{timeOfDay(t.occurredAt)}</div>}
                    </td>
                    <td className="py-2.5 pr-4 text-white">
                      <div>{t.descricao}</div>
                      {(t.counterpart || t.paymentMethod) && (
                        <div className="text-[11px] text-nord-gray">{[t.counterpart, paymentMethodLabel(t.paymentMethod)].filter(Boolean).join(" · ")}</div>
                      )}
                    </td>
                    <td className="py-2.5 pr-4 text-nord-gray whitespace-nowrap">
                      {t.bankAccountName}
                      <div>
                        {t.externalId ? (
                          <span className="inline-block rounded px-1.5 py-px text-[11px] bg-nord-blue/25 text-white" title="Veio da conexão com o banco">Banco</span>
                        ) : (
                          <span className="inline-block rounded px-1.5 py-px text-[11px] bg-white/5 text-nord-gray" title={`Importado do arquivo ${t.importFileName}`}>Arquivo</span>
                        )}
                      </div>
                    </td>
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
                      {t.pendingAtBank && <div className="mt-0.5 text-[11px] text-nord-warning">Não compensado no banco</div>}
                    </td>
                    <td className="py-2.5 pr-4 max-w-[220px]">
                      {t.matchedLabel ? (
                        <span className="inline-flex items-center gap-1 text-xs text-nord-blue-light truncate">
                          <Link2 size={11} className="shrink-0" />
                          <span className="truncate">{t.matchedLabel}</span>
                        </span>
                      ) : (
                        <span className="text-xs text-nord-gray">—</span>
                      )}
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
        {!printing && filtered.length > visible && (
          <div className="mt-3 flex items-center justify-center gap-3 text-xs text-nord-gray print:hidden">
            <span>
              Mostrando {visible} de {filtered.length} lançamentos
            </span>
            <button onClick={() => setShown({ key: filterKey, count: visible + PAGE_SIZE })} className="btn-outline">
              Mostrar mais {PAGE_SIZE}
            </button>
          </div>
        )}
      </Section>

      <Modal open={showImport} onClose={() => setShowImport(false)} title="Importar extrato bancário">
        <FormError message={importError} />
        {importResult && (
          <div
            className={`mb-3 p-3 rounded-lg border ${
              importResult.imported > 0 ? "bg-nord-success/10 border-nord-success/30" : "bg-nord-warning/10 border-nord-warning/30"
            }`}
          >
            {importResult.imported > 0 && (
              <p className="text-xs text-nord-success">{importResult.imported} lançamento(s) importado(s) com sucesso.</p>
            )}
            {importResult.imported === 0 && importResult.skippedCovered > 0 && (
              <p className="text-xs text-nord-success">
                Nenhum lançamento novo: as {importResult.skippedCovered} linha(s) do arquivo já estavam no extrato do banco.
              </p>
            )}
            {importResult.imported === 0 && importResult.skippedCovered === 0 && (
              <p className="text-xs text-nord-warning">Nenhum lançamento foi importado. Problemas encontrados:</p>
            )}
            {importResult.skippedCovered > 0 && importResult.imported > 0 && (
              <p className="mt-1 text-xs text-nord-gray">
                {importResult.skippedCovered} linha(s) do arquivo já estavam no extrato do banco e não foram importadas de novo.
              </p>
            )}
            {importResult.imported > 0 && (
            <p className="mt-1 text-xs text-nord-gray">
              Entradas: <strong className="text-white">{formatCurrency(importResult.totalEntradas)}</strong> · Saídas:{" "}
              <strong className="text-white">{formatCurrency(importResult.totalSaidas)}</strong>
              {importResult.ignored > 0 && (
                <>
                  {" "}
                  · {importResult.ignored} linha(s) ignorada(s) (saldo, total ou valor zero
                  {importResult.ignoredSamples.length > 0 && <>: {importResult.ignoredSamples.join("; ")}</>})
                </>
              )}
            </p>
            )}
            {importResult.checkWarning && (
              <p className="mt-2 text-xs font-medium text-nord-warning">⚠ {importResult.checkWarning}</p>
            )}
            {importResult.detected && (
              <p className="mt-1 text-xs text-nord-gray">
                Formato reconhecido: <span className="text-white">{importResult.detected}</span>. Confira se bate com o seu extrato.
              </p>
            )}
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
                {a.openFinance ? " (conectada ao banco)" : ""}
              </option>
            ))}
          </select>
        </label>
        {accounts.find((a) => a.id === importAccountId)?.openFinance && (
          <p className="mb-3 text-xs text-nord-warning bg-nord-warning/10 border border-nord-warning/30 rounded-lg px-3 py-2">
            Esta conta está <strong>conectada ao banco</strong>: os lançamentos já chegam sozinhos. Use o arquivo só para
            períodos antigos, de antes da conexão. Linhas que o banco já trouxe são reconhecidas e não são importadas de novo.
          </p>
        )}
        <label className="block mb-1">
          <span className="block text-xs text-nord-gray mb-1">Arquivo do extrato (PDF, OFX, Excel ou CSV)</span>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.ofx,.qfx,.xlsx,.csv,.tsv,.txt"
            onChange={handleFileChange}
            disabled={importing}
            className="input"
          />
        </label>
        <p className="text-xs text-nord-gray mt-2">
          O sistema <strong>reconhece sozinho o formato</strong> do arquivo (não precisa ajustar nada):{" "}
          <strong>PDF</strong> do extrato (com texto, como o que o banco baixa no internet banking),{" "}
          <strong>OFX</strong> (o formato mais seguro, gerado pelo banco), <strong>Excel (.xlsx)</strong> e{" "}
          <strong>CSV</strong> (qualquer separador e acentuação). Ele acha a tabela mesmo que venha depois de dados da
          conta, entende data, descrição e valor (ou crédito e débito separados, ou indicador D/C), completa datas que
          o banco escreve só uma vez por dia e ignora linhas de saldo e total. Depois de importar, mostra o que foi
          reconhecido e, quando o extrato traz saldos, confere se a soma dos lançamentos bate com eles. Não lê PDF
          escaneado (foto) nem Excel antigo (.xls).
        </p>
        {importing && (
          <p className="mt-3 text-xs text-nord-blue-light flex items-center gap-1.5">
            <Upload size={12} className="animate-pulse" /> Importando extrato...
          </p>
        )}
      </Modal>

    </div>
  );
}
