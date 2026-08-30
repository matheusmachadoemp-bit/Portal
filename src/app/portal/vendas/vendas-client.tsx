"use client";

import { useMemo, useRef, useState } from "react";
import { Plus, Pencil, Trash2, Download, FileText, Upload } from "lucide-react";
import { PERIOD_OPTIONS, resolvePeriod, type PeriodKey } from "@/lib/periods";
import { formatCurrency, formatNumber, formatPercent, growth, pct, safeDiv } from "@/lib/calc";
import { Section, Badge } from "@/components/ui/stat-card";
import { SortableStatCards } from "@/components/ui/sortable-stat-cards";
import { Modal, ConfirmDialog } from "@/components/ui/modal";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
} from "recharts";
import { format, subDays } from "date-fns";

const REFRESH_WINDOW_DAYS = 90;

type SalesEntryDTO = {
  id: string;
  date: string;
  periodType: string;
  faturamentoDelivery: number;
  faturamentoSalao: number;
  pedidosDelivery: number;
  pedidosBalcao: number;
  pedidosSalao: number;
  mesasAtendidas: number;
  taxaServicoValor: number;
  metaDiaria: number;
  observacoes: string | null;
  source: string;
  createdBy: { name: string } | null;
};

const emptyForm = {
  date: format(new Date(), "yyyy-MM-dd"),
  periodType: "DIARIO",
  faturamentoDelivery: "",
  faturamentoSalao: "",
  pedidosDelivery: "",
  pedidosBalcao: "",
  pedidosSalao: "",
  mesasAtendidas: "",
  taxaServicoValor: "",
  metaDiaria: "",
  observacoes: "",
};

export function VendasClient({
  initialEntries,
  canCreate = true,
  empresaName,
}: {
  initialEntries: SalesEntryDTO[];
  canCreate?: boolean;
  empresaName?: string;
}) {
  const [entries, setEntries] = useState(initialEntries);
  const [periodKey, setPeriodKey] = useState<PeriodKey>("mes");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<SalesEntryDTO | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importLoading, setImportLoading] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<{
    created: number;
    updated: number;
    errors: string[];
    canceladosIgnorados: number;
    outraLojaIgnorados: number;
    otherLojaNames: string[];
  } | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  const { from, to, prevFrom, prevTo } = resolvePeriod(periodKey, {
    from: customFrom,
    to: customTo,
  });

  const currentEntries = useMemo(
    () => entries.filter((e) => new Date(e.date) >= from && new Date(e.date) <= to),
    [entries, from, to]
  );
  const previousEntries = useMemo(
    () => entries.filter((e) => new Date(e.date) >= prevFrom && new Date(e.date) <= prevTo),
    [entries, prevFrom, prevTo]
  );
  const filteredTable = useMemo(
    () =>
      currentEntries.filter((e) =>
        (e.observacoes ?? "").toLowerCase().includes(search.toLowerCase())
      ),
    [currentEntries, search]
  );

  function sum(arr: SalesEntryDTO[], key: keyof SalesEntryDTO) {
    return arr.reduce((acc, e) => acc + (Number(e[key]) || 0), 0);
  }

  const fatDelivery = sum(currentEntries, "faturamentoDelivery");
  const fatSalao = sum(currentEntries, "faturamentoSalao");
  const fatTotal = fatDelivery + fatSalao;
  const pedidosDelivery = sum(currentEntries, "pedidosDelivery");
  const pedidosBalcao = sum(currentEntries, "pedidosBalcao");
  const pedidosSalao = sum(currentEntries, "pedidosSalao");
  const mesas = sum(currentEntries, "mesasAtendidas");
  const taxaServico = sum(currentEntries, "taxaServicoValor");
  const totalPedidos = pedidosDelivery + pedidosBalcao + pedidosSalao;

  const prevFatTotal = sum(previousEntries, "faturamentoDelivery") + sum(previousEntries, "faturamentoSalao");
  const prevPedidos =
    sum(previousEntries, "pedidosDelivery") +
    sum(previousEntries, "pedidosBalcao") +
    sum(previousEntries, "pedidosSalao");

  const ticketGeral = safeDiv(fatTotal, totalPedidos);
  const ticketDelivery = safeDiv(fatDelivery, pedidosDelivery);
  const ticketSalao = safeDiv(fatSalao, pedidosSalao || mesas);
  const taxaServicoPct = pct(taxaServico, fatSalao);

  const chartData = useMemo(() => {
    return [...currentEntries]
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .map((e) => ({
        date: format(new Date(e.date), "dd/MM"),
        Delivery: e.faturamentoDelivery,
        Salão: e.faturamentoSalao,
      }));
  }, [currentEntries]);

  function openNew() {
    setEditing(null);
    setForm(emptyForm);
    setShowForm(true);
  }

  function openEdit(entry: SalesEntryDTO) {
    setEditing(entry);
    setForm({
      date: format(new Date(entry.date), "yyyy-MM-dd"),
      periodType: entry.periodType,
      faturamentoDelivery: String(entry.faturamentoDelivery),
      faturamentoSalao: String(entry.faturamentoSalao),
      pedidosDelivery: String(entry.pedidosDelivery),
      pedidosBalcao: String(entry.pedidosBalcao),
      pedidosSalao: String(entry.pedidosSalao),
      mesasAtendidas: String(entry.mesasAtendidas),
      taxaServicoValor: String(entry.taxaServicoValor),
      metaDiaria: String(entry.metaDiaria),
      observacoes: entry.observacoes ?? "",
    });
    setShowForm(true);
  }

  async function refresh() {
    const from = subDays(new Date(), REFRESH_WINDOW_DAYS).toISOString();
    const to = new Date().toISOString();
    const res = await fetch(`/api/vendas?from=${from}&to=${to}`);
    const data = await res.json();
    setEntries(data.entries);
  }

  async function submit() {
    const payload = { ...form };
    if (editing) {
      await fetch(`/api/vendas/${editing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } else {
      await fetch("/api/vendas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    }
    setShowForm(false);
    refresh();
  }

  async function doDelete() {
    if (!confirmDeleteId) return;
    await fetch(`/api/vendas/${confirmDeleteId}`, { method: "DELETE" });
    setConfirmDeleteId(null);
    refresh();
  }

  function openImport() {
    setImportFile(null);
    setImportError(null);
    setImportResult(null);
    setShowImport(true);
  }

  async function submitImport() {
    if (!importFile) {
      setImportError("Selecione um arquivo .xlsx ou .csv antes de importar.");
      return;
    }
    setImportLoading(true);
    setImportError(null);
    setImportResult(null);
    try {
      const body = new FormData();
      body.append("file", importFile);
      const res = await fetch("/api/vendas/importar", { method: "POST", body });
      const data = await res.json();
      if (!res.ok) {
        setImportError(data.error ?? "Não foi possível importar o arquivo.");
        return;
      }
      setImportResult({
        created: data.created,
        updated: data.updated,
        errors: data.errors ?? [],
        canceladosIgnorados: data.canceladosIgnorados ?? 0,
        outraLojaIgnorados: data.outraLojaIgnorados ?? 0,
        otherLojaNames: data.otherLojaNames ?? [],
      });
      setImportFile(null);
      if (importInputRef.current) importInputRef.current.value = "";
      refresh();
    } catch {
      setImportError("Falha ao enviar o arquivo. Verifique sua conexão e tente novamente.");
    } finally {
      setImportLoading(false);
    }
  }

  function exportCsv() {
    const header = [
      "Data",
      "Fat. Delivery",
      "Fat. Salão",
      "Pedidos Delivery",
      "Pedidos Balcão",
      "Pedidos Salão",
      "Mesas",
      "Taxa Serviço",
    ];
    const rows = filteredTable.map((e) => [
      format(new Date(e.date), "dd/MM/yyyy"),
      e.faturamentoDelivery,
      e.faturamentoSalao,
      e.pedidosDelivery,
      e.pedidosBalcao,
      e.pedidosSalao,
      e.mesasAtendidas,
      e.taxaServicoValor,
    ]);
    const csv = [header, ...rows].map((r) => r.join(";")).join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "vendas.csv";
    a.click();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2 justify-between">
        <div className="flex flex-wrap items-center gap-2">
          {PERIOD_OPTIONS.map((p) => (
            <button
              key={p.key}
              onClick={() => setPeriodKey(p.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
                periodKey === p.key
                  ? "bg-nord-blue text-white border-nord-blue"
                  : "border-nord-border text-nord-gray hover:text-white"
              }`}
            >
              {p.label}
            </button>
          ))}
          {periodKey === "personalizado" && (
            <div className="flex items-center gap-1">
              <input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="bg-nord-card border border-nord-border rounded-lg px-2 py-1 text-xs text-white"
              />
              <span className="text-nord-gray text-xs">até</span>
              <input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                className="bg-nord-card border border-nord-border rounded-lg px-2 py-1 text-xs text-white"
              />
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={exportCsv}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border border-nord-border text-nord-gray hover:text-white"
          >
            <Download size={13} /> Excel/CSV
          </button>
          <button
            onClick={() => window.print()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border border-nord-border text-nord-gray hover:text-white"
          >
            <FileText size={13} /> PDF
          </button>
          {canCreate && (
            <button
              onClick={openImport}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border border-nord-border text-nord-gray hover:text-white"
            >
              <Upload size={13} /> Importar arquivo
            </button>
          )}
          {canCreate && (
            <button
              onClick={openNew}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-nord-blue hover:bg-nord-blue-light text-white font-medium"
            >
              <Plus size={13} /> Novo lançamento
            </button>
          )}
        </div>
      </div>
      {!canCreate && (
        <p className="text-xs text-amber-400 bg-amber-950/20 border border-amber-900/40 rounded-lg px-3 py-2">
          Você está no modo Grupo Nord (consolidado). Selecione uma loja específica no menu lateral para lançar
          ou editar dados.
        </p>
      )}

      <SortableStatCards
        storageKey="vendas-kpi-order"
        className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4"
        cards={[
          { key: "faturamento-total", label: "Faturamento total", value: formatCurrency(fatTotal), icon: "DollarSign", delta: growth(fatTotal, prevFatTotal) },
          { key: "faturamento-delivery", label: "Faturamento delivery", value: formatCurrency(fatDelivery), icon: "Bike" },
          { key: "faturamento-salao", label: "Faturamento salão", value: formatCurrency(fatSalao), icon: "Utensils" },
          { key: "ticket-medio-geral", label: "Ticket médio geral", value: formatCurrency(ticketGeral), icon: "Receipt" },
          { key: "ticket-medio-delivery", label: "Ticket médio delivery", value: formatCurrency(ticketDelivery), icon: "Receipt" },
          { key: "ticket-medio-salao", label: "Ticket médio salão", value: formatCurrency(ticketSalao), icon: "Receipt" },
          { key: "pedidos-delivery", label: "Pedidos delivery", value: formatNumber(pedidosDelivery), icon: "Package" },
          { key: "pedidos-balcao", label: "Pedidos balcão", value: formatNumber(pedidosBalcao), icon: "Store" },
          { key: "pedidos-salao", label: "Pedidos salão", value: formatNumber(pedidosSalao), icon: "Utensils" },
          { key: "mesas-atendidas", label: "Mesas atendidas", value: formatNumber(mesas), icon: "Users" },
          { key: "taxa-servico", label: "Taxa de serviço", value: formatPercent(taxaServicoPct), icon: "Percent" },
          { key: "total-pedidos", label: "Total de pedidos", value: formatNumber(totalPedidos), icon: "ShoppingBag", delta: growth(totalPedidos, prevPedidos) },
        ]}
      />

      <Section title="Evolução do faturamento no período">
        <ResponsiveContainer width="100%" height={260}>
          <AreaChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2e" />
            <XAxis dataKey="date" stroke="#9a9aa2" fontSize={11} />
            <YAxis stroke="#9a9aa2" fontSize={11} tickFormatter={(v) => `${v / 1000}k`} />
            <Tooltip
              contentStyle={{ background: "#1a1a1d", border: "1px solid #2a2a2e", borderRadius: 8 }}
              formatter={(v) => formatCurrency(Number(v))}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Area type="monotone" dataKey="Delivery" stackId="1" stroke="#2952E3" fill="#2952E3" fillOpacity={0.5} />
            <Area type="monotone" dataKey="Salão" stackId="1" stroke="#4d70ff" fill="#4d70ff" fillOpacity={0.5} />
          </AreaChart>
        </ResponsiveContainer>
      </Section>

      <Section
        title="Histórico de lançamentos"
        action={
          <input
            placeholder="Buscar nas observações..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="bg-nord-panel border border-nord-border rounded-lg px-3 py-1.5 text-xs text-white outline-none focus:border-nord-blue w-56"
          />
        }
      >
        <div className="overflow-x-auto nord-scrollbar">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-nord-gray border-b border-nord-border">
                <th className="py-2 pr-4">Data</th>
                <th className="py-2 pr-4">Delivery</th>
                <th className="py-2 pr-4">Salão</th>
                <th className="py-2 pr-4">Pedidos</th>
                <th className="py-2 pr-4">Mesas</th>
                <th className="py-2 pr-4">Taxa serviço</th>
                <th className="py-2 pr-4">Responsável</th>
                <th className="py-2 pr-4"></th>
              </tr>
            </thead>
            <tbody>
              {filteredTable.map((e) => (
                <tr key={e.id} className="border-b border-nord-border/50 hover:bg-white/5">
                  <td className="py-2 pr-4 text-white">{format(new Date(e.date), "dd/MM/yyyy")}</td>
                  <td className="py-2 pr-4 text-nord-gray">{formatCurrency(e.faturamentoDelivery)}</td>
                  <td className="py-2 pr-4 text-nord-gray">{formatCurrency(e.faturamentoSalao)}</td>
                  <td className="py-2 pr-4 text-nord-gray">
                    {e.pedidosDelivery + e.pedidosBalcao + e.pedidosSalao}
                  </td>
                  <td className="py-2 pr-4 text-nord-gray">{e.mesasAtendidas}</td>
                  <td className="py-2 pr-4 text-nord-gray">{formatCurrency(e.taxaServicoValor)}</td>
                  <td className="py-2 pr-4 text-nord-gray">
                    {e.source === "SAIPOS" ? (
                      <Badge tone="info">Saipos (automático)</Badge>
                    ) : e.source === "IMPORTADO" ? (
                      <Badge tone="info">Importado (arquivo)</Badge>
                    ) : (
                      e.createdBy?.name ?? "—"
                    )}
                  </td>
                  <td className="py-2 pr-4">
                    {canCreate && (
                      <div className="flex items-center gap-2 justify-end">
                        <button onClick={() => openEdit(e)} className="text-nord-gray hover:text-white">
                          <Pencil size={14} />
                        </button>
                        <button
                          onClick={() => setConfirmDeleteId(e.id)}
                          className="text-nord-gray hover:text-red-400"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {filteredTable.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-6 text-center text-nord-gray text-sm">
                    Nenhum lançamento no período selecionado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Section>

      <Modal
        open={showForm}
        onClose={() => setShowForm(false)}
        title={editing ? "Editar lançamento" : "Novo lançamento de vendas"}
      >
        <div className="grid grid-cols-2 gap-3">
          <Field label="Data">
            <input
              type="date"
              value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
              className="input"
            />
          </Field>
          <Field label="Tipo de período">
            <select
              value={form.periodType}
              onChange={(e) => setForm({ ...form, periodType: e.target.value })}
              className="input"
            >
              <option value="DIARIO">Diário</option>
              <option value="SEMANAL">Semanal</option>
              <option value="MENSAL">Mensal</option>
            </select>
          </Field>
          <Field label="Faturamento Delivery">
            <input
              type="number"
              value={form.faturamentoDelivery}
              onChange={(e) => setForm({ ...form, faturamentoDelivery: e.target.value })}
              className="input"
            />
          </Field>
          <Field label="Faturamento Salão">
            <input
              type="number"
              value={form.faturamentoSalao}
              onChange={(e) => setForm({ ...form, faturamentoSalao: e.target.value })}
              className="input"
            />
          </Field>
          <Field label="Pedidos Delivery">
            <input
              type="number"
              value={form.pedidosDelivery}
              onChange={(e) => setForm({ ...form, pedidosDelivery: e.target.value })}
              className="input"
            />
          </Field>
          <Field label="Pedidos Balcão">
            <input
              type="number"
              value={form.pedidosBalcao}
              onChange={(e) => setForm({ ...form, pedidosBalcao: e.target.value })}
              className="input"
            />
          </Field>
          <Field label="Pedidos Salão">
            <input
              type="number"
              value={form.pedidosSalao}
              onChange={(e) => setForm({ ...form, pedidosSalao: e.target.value })}
              className="input"
            />
          </Field>
          <Field label="Mesas atendidas">
            <input
              type="number"
              value={form.mesasAtendidas}
              onChange={(e) => setForm({ ...form, mesasAtendidas: e.target.value })}
              className="input"
            />
          </Field>
          <Field label="Taxa de serviço (R$)">
            <input
              type="number"
              value={form.taxaServicoValor}
              onChange={(e) => setForm({ ...form, taxaServicoValor: e.target.value })}
              className="input"
            />
          </Field>
          <Field label="Meta do dia (R$)">
            <input
              type="number"
              value={form.metaDiaria}
              onChange={(e) => setForm({ ...form, metaDiaria: e.target.value })}
              className="input"
            />
          </Field>
          <div className="col-span-2">
            <Field label="Observações">
              <textarea
                value={form.observacoes}
                onChange={(e) => setForm({ ...form, observacoes: e.target.value })}
                className="input min-h-16"
              />
            </Field>
          </div>
        </div>
        <button
          onClick={submit}
          className="w-full mt-4 bg-nord-blue hover:bg-nord-blue-light text-white text-sm font-medium rounded-lg py-2.5"
        >
          Salvar lançamento
        </button>
      </Modal>

      <Modal
        open={showImport}
        onClose={() => setShowImport(false)}
        title="Importar arquivo de vendas"
      >
        <div className="space-y-3 text-sm text-nord-gray">
          <p>
            Use esta opção enquanto a sincronização automática com a Saipos não está disponível. No Saipos, gere o
            relatório <span className="text-white">&quot;Vendas por período&quot;</span> (uma linha por
            pedido/comanda) e envie o arquivo aqui (.xlsx ou .csv).
          </p>
          <div className="bg-nord-panel border border-nord-border rounded-lg px-3 py-2 text-xs space-y-1.5">
            <p className="text-white font-medium">Antes de exportar no Saipos:</p>
            <p>
              Filtre o relatório para <span className="text-white">esta loja</span> ({empresaName ?? "a loja selecionada no menu lateral"}) e para o
              período que deseja importar — isso é importante: o Saipos só identifica a loja de cada venda quando
              ela vem de um parceiro online (iFood, Cardápio Web, 99Food). Vendas de mesa e comanda feitas direto
              no caixa <span className="text-white">não trazem o nome da loja no arquivo</span>, então o sistema
              não tem como saber de qual loja são — ele assume que todas pertencem à loja selecionada aqui. Se o
              arquivo tiver vendas de mais de uma loja misturadas, o faturamento de mesa/comanda pode ficar
              somado na loja errada. Para vendas por parceiro (delivery/balcão), o sistema consegue identificar e
              ignora automaticamente as de outra loja.
            </p>
            <p>
              O sistema soma o faturamento e os pedidos de cada dia a partir das colunas &quot;Tipo do
              pedido&quot;, &quot;Data da venda&quot;, &quot;Total&quot; e &quot;Total taxa de serviço&quot;.
              Vendas cancelas são ignoradas.
            </p>
            <p>
              Se já existir um lançamento salvo para um dia que está no arquivo, ele será{" "}
              <span className="text-white">substituído</span> pelos dados importados.
            </p>
          </div>
          <label className="block">
            <span className="block text-xs text-nord-gray mb-1">Arquivo (.xlsx ou .csv)</span>
            <input
              ref={importInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={(e) => setImportFile(e.target.files?.[0] ?? null)}
              className="input"
            />
          </label>
          {importError && <p className="text-xs text-red-400">{importError}</p>}
          {importResult && (
            <div className="text-xs bg-emerald-950/20 border border-emerald-900/40 rounded-lg px-3 py-2 text-emerald-300 space-y-1">
              <p>
                Importação concluída: {importResult.created} dia(s) criado(s) e {importResult.updated} dia(s)
                atualizado(s).
              </p>
              {importResult.canceladosIgnorados > 0 && (
                <p className="text-nord-gray">{importResult.canceladosIgnorados} venda(s) cancelada(s) no arquivo foram ignoradas.</p>
              )}
              {importResult.outraLojaIgnorados > 0 && (
                <div className="text-amber-300">
                  <p>
                    {importResult.outraLojaIgnorados} venda(s) de delivery/balcão do arquivo eram de outra(s) loja(s) e
                    foram ignoradas{importResult.otherLojaNames.length > 0 ? `: ${importResult.otherLojaNames.join(", ")}.` : "."}
                  </p>
                  <p className="mt-1">
                    Como o arquivo tem mais de uma loja misturada, as vendas de mesa/comanda (que não trazem o
                    nome da loja) podem ter incluído vendas de outra loja nesta importação. Se possível, refaça
                    a exportação no Saipos filtrando só por esta loja e importe de novo para corrigir.
                  </p>
                </div>
              )}
              {importResult.errors.length > 0 && (
                <div className="text-amber-300">
                  <p>{importResult.errors.length} linha(s) ignorada(s):</p>
                  <ul className="list-disc list-inside">
                    {importResult.errors.slice(0, 5).map((err, idx) => (
                      <li key={idx}>{err}</li>
                    ))}
                  </ul>
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

      <ConfirmDialog
        open={!!confirmDeleteId}
        title="Excluir lançamento"
        message="Tem certeza que deseja excluir este lançamento de vendas?"
        onConfirm={doDelete}
        onCancel={() => setConfirmDeleteId(null)}
        confirmLabel="Excluir"
        danger
      />

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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs text-nord-gray mb-1">{label}</span>
      {children}
    </label>
  );
}
