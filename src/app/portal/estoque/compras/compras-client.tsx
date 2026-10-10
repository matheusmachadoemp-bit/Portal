"use client";

import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Section, Badge } from "@/components/ui/stat-card";
import { SortableStatCards } from "@/components/ui/sortable-stat-cards";
import { Modal } from "@/components/ui/modal";
import { Toolbar } from "@/components/ui/toolbar";
import { PeriodFilterBar } from "@/components/ui/period-filter";
import { formatCurrency, formatNumber } from "@/lib/calc";
import { format } from "date-fns";
import { PURCHASE_STATUS, PURCHASE_STATUS_LABEL, PURCHASE_STATUS_TONE } from "@/lib/estoque";
import { PAYMENT_METHOD_LABEL } from "@/lib/vendas-analytics";
import { type RollingPeriodKey } from "@/lib/periods";

type Item = { id: string; ingredientId: string; ingredientName: string; unidade: string; quantidade: number; valorUnitario: number; valorTotal: number; precoMedioAtual: number };
type Purchase = {
  id: string;
  numeroNota: string | null;
  data: string;
  previsaoEntrega: string | null;
  supplierId: string;
  supplierName: string;
  compradorResponsavel: string | null;
  formaPagamento: string | null;
  dataVencimento: string | null;
  desconto: number;
  frete: number;
  status: string;
  observacoes: string | null;
  createdByName: string;
  recebido: boolean;
  items: Item[];
  valorTotal: number;
};

type NewItem = { ingredientId: string; quantidade: string; unidade: string; valorUnitario: string };

// Edição de um pedido já existente (botão "Editar" no histórico). Cabeçalho com os mesmos campos
// de "Nova compra" + os campos extras que a API já aceitava (previsão de entrega, comprador,
// forma de pagamento, vencimento) — numeroNota/observações/status ficam de fora de propósito: já
// eram editáveis antes desta tarefa por outros fluxos, e não fazem parte do pedido desta tela. Os
// itens são fixos (sem adicionar/remover produto): só quantidade e valor unitário são editáveis,
// ver PATCH /api/estoque/compras/[id].
type EditForm = {
  supplierId: string;
  data: string;
  previsaoEntrega: string;
  compradorResponsavel: string;
  formaPagamento: string;
  dataVencimento: string;
  desconto: string;
  frete: string;
};
type EditItem = { id: string; ingredientName: string; unidade: string; quantidade: string; valorUnitario: string; precoMedioAtual: number };

const EMPTY_EDIT_FORM: EditForm = {
  supplierId: "",
  data: "",
  previsaoEntrega: "",
  compradorResponsavel: "",
  formaPagamento: "",
  dataVencimento: "",
  desconto: "0",
  frete: "0",
};

// Mesma lista usada em Financeiro > Contas a Pagar (contas-pagar-client.tsx) para "pagar um
// fornecedor" — diferente de SALE_PAYMENT_METHODS (como o CLIENTE pagou a loja), que traz
// Voucher/Pago Online/Fiado, sem sentido para pagamento a fornecedor.
const PURCHASE_PAYMENT_METHODS = ["PIX", "DINHEIRO", "CARTAO_DEBITO", "CARTAO_CREDITO", "TED", "DOC", "TRANSFERENCIA", "CHEQUE", "BOLETO", "OUTRO"] as const;

export function ComprasClient({
  initialPurchases,
  initialPendentesEntrega,
  suppliers,
  ingredients,
  canCreate,
}: {
  initialPurchases: Purchase[];
  /** Contagem de pedidos "Pedido realizado"/"Aguardando entrega", SEM filtro de data — ver
   * comentário em `fetchPendentesEntrega` abaixo sobre por que esse card não pode vir do
   * `purchases` (que agora é sempre filtrado pelo período escolhido na tela). */
  initialPendentesEntrega: number;
  suppliers: { id: string; name: string }[];
  ingredients: { id: string; name: string; unidade: string; unidadeCompra: string | null; precoAtual: number }[];
  canCreate: boolean;
}) {
  const [purchases, setPurchases] = useState(initialPurchases);
  const [pendentesEntrega, setPendentesEntrega] = useState(initialPendentesEntrega);
  const [statusFilter, setStatusFilter] = useState("");
  const [supplierFilter, setSupplierFilter] = useState("");
  // Filtro de período (padrão do portal — ver CLAUDE.md): "mes-atual" bate com
  // o período que a carga inicial do servidor já usa (page.tsx), pra não
  // mostrar um período diferente do que o filtro exibe como selecionado.
  const [periodo, setPeriodo] = useState<RollingPeriodKey>("mes-atual");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [loadingPeriodo, setLoadingPeriodo] = useState(false);
  const [periodoError, setPeriodoError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<Purchase | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [supplierId, setSupplierId] = useState("");
  const [numeroNota, setNumeroNota] = useState("");
  const [data, setData] = useState(new Date().toISOString().slice(0, 10));
  const [frete, setFrete] = useState("0");
  const [desconto, setDesconto] = useState("0");
  const [itens, setItens] = useState<NewItem[]>([{ ingredientId: "", quantidade: "", unidade: "", valorUnitario: "" }]);

  const [editing, setEditing] = useState<Purchase | null>(null);
  const [editForm, setEditForm] = useState<EditForm>(EMPTY_EDIT_FORM);
  const [editItens, setEditItens] = useState<EditItem[]>([]);
  const [editError, setEditError] = useState<string | null>(null);
  const [editSubmitting, setEditSubmitting] = useState(false);

  const filtered = useMemo(
    () =>
      purchases.filter((p) => {
        if (statusFilter && p.status !== statusFilter) return false;
        if (supplierFilter && p.supplierId !== supplierFilter) return false;
        return true;
      }),
    [purchases, statusFilter, supplierFilter]
  );

  const valorTotalPeriodo = filtered.reduce((s, p) => s + p.valorTotal, 0);

  /**
   * Busca as compras já filtradas por período no servidor (GET
   * /api/estoque/compras?key=...&from=...&to=...) — mesmo padrão de
   * src/app/portal/marketing/redes-sociais/redes-sociais-client.tsx e
   * .../marketing/parcerias/partners-client.tsx. Agora que o backend aceita
   * esse filtro, a tela SEMPRE manda uma `key` (nunca busca mais sem filtro
   * nenhum) — inclusive no botão "Atualizar" e depois de qualquer ação (nova
   * compra, marcar recebido), por isso `refresh()` abaixo reaplica o período
   * já selecionado em vez de voltar a mostrar as últimas 300 compras sem
   * filtro.
   */
  async function fetchPurchases(key: RollingPeriodKey, from?: string, to?: string) {
    const params = new URLSearchParams({ key });
    if (key === "personalizado" && from && to) {
      params.set("from", from);
      params.set("to", to);
    }
    const res = await fetch(`/api/estoque/compras?${params.toString()}`);
    if (!res.ok) throw new Error();
    const data = await res.json();
    setPurchases(
      data.purchases.map((p: Record<string, unknown>) => {
        const items: Item[] = (p.items as Record<string, unknown>[]).map((it) => ({
          id: it.id as string,
          ingredientId: it.ingredientId as string,
          ingredientName: (it.ingredient as { name: string }).name,
          unidade: it.unidade as string,
          quantidade: it.quantidade as number,
          valorUnitario: it.valorUnitario as number,
          valorTotal: it.valorTotal as number,
          precoMedioAtual: (it.ingredient as { precoAtual: number }).precoAtual,
        }));
        return {
          id: p.id,
          numeroNota: p.numeroNota,
          data: p.data,
          previsaoEntrega: p.previsaoEntrega,
          supplierId: p.supplierId,
          supplierName: (p.supplier as { nomeFantasia: string | null; razaoSocial: string }).nomeFantasia ?? (p.supplier as { razaoSocial: string }).razaoSocial,
          compradorResponsavel: p.compradorResponsavel,
          formaPagamento: p.formaPagamento,
          dataVencimento: p.dataVencimento,
          desconto: p.desconto,
          frete: p.frete,
          status: p.status,
          observacoes: p.observacoes,
          createdByName: (p.createdBy as { name: string }).name,
          recebido: !!p.receiving,
          items,
          valorTotal: items.reduce((s: number, it: Item) => s + it.valorTotal, 0) + (p.frete as number) - (p.desconto as number),
        };
      })
    );
  }

  /**
   * O card "Aguardando entrega" responde "esse pedido ainda está pendente?" —
   * uma pergunta que não depende de quando o pedido foi feito, então NÃO pode
   * vir de `purchases` (que agora é sempre filtrado pelo período escolhido na
   * tela): um pedido feito em agosto e ainda pendente em outubro simplesmente
   * sumiria desse card assim que "Este mês" (o padrão da tela) virasse o mês,
   * escondendo um pendente de verdade (achado do Teulis na revisão desta
   * tarefa). Por isso essa contagem busca à parte, sempre sem filtro de data,
   * reaproveitando a MESMA rota/consulta de Estoque > Recebimento (GET
   * /api/estoque/recebimento — `pendentes`, ver src/app/api/estoque/
   * recebimento/route.ts) em vez de derivar de `purchases` — igual à contagem
   * inicial feita no servidor em page.tsx.
   */
  async function fetchPendentesEntrega() {
    try {
      const res = await fetch("/api/estoque/recebimento");
      if (!res.ok) return;
      const data = await res.json();
      const pendentes = (data.pendentes as { status: string }[]).filter(
        (p) => p.status === "PEDIDO_REALIZADO" || p.status === "AGUARDANDO_ENTREGA"
      ).length;
      setPendentesEntrega(pendentes);
    } catch {
      // Não crítico — mantém o último valor conhecido em vez de quebrar a tela.
    }
  }

  async function refresh() {
    try {
      await Promise.all([fetchPurchases(periodo, customFrom, customTo), fetchPendentesEntrega()]);
    } catch {
      setPeriodoError("Não foi possível atualizar os dados.");
    }
  }

  async function applyPeriodo(key: RollingPeriodKey, from?: string, to?: string) {
    setPeriodo(key);
    if (key === "personalizado" && from && to) {
      setCustomFrom(from);
      setCustomTo(to);
    }
    setLoadingPeriodo(true);
    setPeriodoError(null);
    try {
      await fetchPurchases(key, from, to);
    } catch {
      setPeriodoError("Não foi possível carregar os dados desse período.");
    } finally {
      setLoadingPeriodo(false);
    }
  }

  function addItem() {
    setItens([...itens, { ingredientId: "", quantidade: "", unidade: "", valorUnitario: "" }]);
  }
  function updateItem(idx: number, patch: Partial<NewItem>) {
    setItens(itens.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  }
  function removeItem(idx: number) {
    setItens(itens.filter((_, i) => i !== idx));
  }

  async function submit() {
    if (submitting) return;
    setError(null);
    const validItens = itens.filter((it) => it.ingredientId && it.quantidade && it.valorUnitario);
    if (!supplierId || validItens.length === 0) {
      setError("Selecione o fornecedor e informe ao menos um item válido.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/estoque/compras", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ supplierId, numeroNota, data, frete, desconto, itens: validItens }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error ?? "Não foi possível registrar a compra.");
        return;
      }
      setShowForm(false);
      setSupplierId("");
      setNumeroNota("");
      setItens([{ ingredientId: "", quantidade: "", unidade: "", valorUnitario: "" }]);
      refresh();
    } finally {
      setSubmitting(false);
    }
  }

  async function marcarRecebido(p: Purchase) {
    await fetch(`/api/estoque/compras/${p.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "RECEBIDO" }),
    });
    refresh();
  }

  function openEdit(p: Purchase) {
    setEditError(null);
    setEditForm({
      supplierId: p.supplierId,
      data: p.data.slice(0, 10),
      previsaoEntrega: p.previsaoEntrega ? p.previsaoEntrega.slice(0, 10) : "",
      compradorResponsavel: p.compradorResponsavel ?? "",
      formaPagamento: p.formaPagamento ?? "",
      dataVencimento: p.dataVencimento ? p.dataVencimento.slice(0, 10) : "",
      desconto: String(p.desconto),
      frete: String(p.frete),
    });
    setEditItens(
      p.items.map((it) => ({
        id: it.id,
        ingredientName: it.ingredientName,
        unidade: it.unidade,
        quantidade: String(it.quantidade),
        valorUnitario: String(it.valorUnitario),
        precoMedioAtual: it.precoMedioAtual,
      }))
    );
    setEditing(p);
  }

  function updateEditItem(idx: number, patch: Partial<Pick<EditItem, "quantidade" | "valorUnitario">>) {
    setEditItens(editItens.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  }

  async function submitEdit() {
    if (!editing || editSubmitting) return;
    setEditError(null);
    if (!editForm.supplierId) {
      setEditError("Selecione o fornecedor.");
      return;
    }
    if (!editForm.data) {
      setEditError("Informe a data da compra.");
      return;
    }
    for (const it of editItens) {
      if (!it.quantidade || Number(it.quantidade) <= 0) {
        setEditError("Informe uma quantidade válida (maior que zero) para todos os itens.");
        return;
      }
      if (it.valorUnitario === "" || Number(it.valorUnitario) < 0) {
        setEditError("Informe um valor unitário válido para todos os itens.");
        return;
      }
    }
    setEditSubmitting(true);
    try {
      const res = await fetch(`/api/estoque/compras/${editing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplierId: editForm.supplierId,
          data: editForm.data,
          previsaoEntrega: editForm.previsaoEntrega || null,
          compradorResponsavel: editForm.compradorResponsavel || null,
          formaPagamento: editForm.formaPagamento || null,
          dataVencimento: editForm.dataVencimento || null,
          desconto: editForm.desconto,
          frete: editForm.frete,
          items: editItens.map((it) => ({ id: it.id, quantidade: it.quantidade, valorUnitario: it.valorUnitario })),
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setEditError(d.error ?? "Não foi possível salvar as alterações.");
        return;
      }
      setEditing(null);
      refresh();
    } finally {
      setEditSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <SortableStatCards
        storageKey="estoque-compras-kpi-order"
        className="grid grid-cols-2 md:grid-cols-3 gap-4"
        cards={[
          { key: "compras-filtro", label: "Compras no filtro", value: String(filtered.length), icon: "ShoppingBasket" },
          { key: "valor-total", label: "Valor total", value: formatCurrency(valorTotalPeriodo), icon: "DollarSign", color: "#22c55e" },
          { key: "aguardando-entrega", label: "Aguardando entrega", value: String(pendentesEntrega), icon: "Truck", color: pendentesEntrega ? "#f59e0b" : "#22c55e" },
        ]}
      />

      <Section
        title="Histórico de compras"
        action={
          <Toolbar
            filters={
              <>
                <select className="input w-48" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                  <option value="">Todos os status</option>
                  {PURCHASE_STATUS.map((s) => (
                    <option key={s} value={s}>{PURCHASE_STATUS_LABEL[s]}</option>
                  ))}
                </select>
                <select className="input w-48" value={supplierFilter} onChange={(e) => setSupplierFilter(e.target.value)}>
                  <option value="">Todos os fornecedores</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </>
            }
            exportFilename="compras"
            exportSheetName="Compras"
            exportRows={() =>
              filtered.map((p) => ({
                Data: format(new Date(p.data), "dd/MM/yyyy"),
                Fornecedor: p.supplierName,
                "Nota fiscal": p.numeroNota ?? "",
                Status: PURCHASE_STATUS_LABEL[p.status] ?? p.status,
                "Valor total": p.valorTotal,
              }))
            }
            onRefresh={refresh}
            onAdd={canCreate ? () => { setError(null); setShowForm(true); } : undefined}
            addLabel="Nova compra"
          />
        }
      >
        <div className="mb-4">
          <PeriodFilterBar periodo={periodo} onApply={applyPeriodo} loading={loadingPeriodo} />
          {periodoError && <p className="text-xs text-nord-danger mt-2">{periodoError}</p>}
        </div>

        <div className="overflow-x-auto nord-scrollbar">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-nord-gray border-b border-nord-border">
                <th className="py-2 pr-4">Data</th>
                <th className="py-2 pr-4">Fornecedor</th>
                <th className="py-2 pr-4">Nota fiscal</th>
                <th className="py-2 pr-4">Itens</th>
                <th className="py-2 pr-4">Valor total</th>
                <th className="py-2 pr-4">Status</th>
                <th className="py-2 pr-4" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => {
                const precoAcimaMedia = p.items.some((it) => it.precoMedioAtual > 0 && it.valorUnitario > it.precoMedioAtual * 1.15);
                return (
                  <tr key={p.id} className="border-b border-nord-border/50 hover:bg-white/5">
                    <td className="py-2.5 pr-4 text-nord-gray">{format(new Date(p.data), "dd/MM/yyyy")}</td>
                    <td className="py-2.5 pr-4 text-white">{p.supplierName}</td>
                    <td className="py-2.5 pr-4 text-nord-gray">{p.numeroNota ?? "—"}</td>
                    <td className="py-2.5 pr-4 text-nord-gray">{p.items.length}</td>
                    <td className="py-2.5 pr-4 text-nord-gray">
                      {formatCurrency(p.valorTotal)}
                      {precoAcimaMedia && (
                        <Badge tone="warning"> Acima da média</Badge>
                      )}
                    </td>
                    <td className="py-2.5 pr-4">
                      <Badge tone={PURCHASE_STATUS_TONE[p.status]}>{PURCHASE_STATUS_LABEL[p.status] ?? p.status}</Badge>
                    </td>
                    <td className="py-2.5 pr-4 text-right space-x-2 whitespace-nowrap">
                      <button onClick={() => setDetail(p)} className="text-xs text-nord-blue-light hover:underline">
                        Detalhes
                      </button>
                      {canCreate && !p.recebido && (
                        <button onClick={() => openEdit(p)} className="text-xs text-nord-gray hover:text-white hover:underline">
                          Editar
                        </button>
                      )}
                      {canCreate && !p.recebido && p.status !== "CANCELADO" && (
                        <button onClick={() => marcarRecebido(p)} className="text-xs text-nord-success hover:underline">
                          Marcar recebido
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-6 text-center text-nord-gray">
                    Nenhuma compra encontrada.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Section>

      <Modal open={showForm} onClose={() => setShowForm(false)} title="Nova compra" widthClass="max-w-3xl">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4">
          <label className="block md:col-span-2">
            <span className="block text-xs text-nord-gray mb-1">Fornecedor</span>
            <select className="input" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
              <option value="">Selecione...</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="block text-xs text-nord-gray mb-1">Nº da nota fiscal</span>
            <input className="input" value={numeroNota} onChange={(e) => setNumeroNota(e.target.value)} />
          </label>
          <label className="block">
            <span className="block text-xs text-nord-gray mb-1">Data</span>
            <input className="input" type="date" value={data} onChange={(e) => setData(e.target.value)} />
          </label>
          <label className="block">
            <span className="block text-xs text-nord-gray mb-1">Frete (R$)</span>
            <input className="input" type="number" value={frete} onChange={(e) => setFrete(e.target.value)} />
          </label>
          <label className="block">
            <span className="block text-xs text-nord-gray mb-1">Desconto (R$)</span>
            <input className="input" type="number" value={desconto} onChange={(e) => setDesconto(e.target.value)} />
          </label>
        </div>

        <div className="space-y-2">
          <span className="block text-xs text-nord-gray">Itens da compra</span>
          {itens.map((it, idx) => {
            const ing = ingredients.find((i) => i.id === it.ingredientId);
            return (
              <div key={idx} className="flex items-center gap-2">
                <select
                  className="input flex-1"
                  value={it.ingredientId}
                  onChange={(e) => {
                    const selected = ingredients.find((i) => i.id === e.target.value);
                    updateItem(idx, { ingredientId: e.target.value, unidade: selected?.unidadeCompra ?? selected?.unidade ?? "" });
                  }}
                >
                  <option value="">Produto...</option>
                  {ingredients.map((i) => (
                    <option key={i.id} value={i.id}>{i.name}</option>
                  ))}
                </select>
                <input className="input w-24" placeholder="Qtd." type="number" value={it.quantidade} onChange={(e) => updateItem(idx, { quantidade: e.target.value })} />
                <input className="input w-28" placeholder="Unidade" value={it.unidade} onChange={(e) => updateItem(idx, { unidade: e.target.value })} />
                <input className="input w-28" placeholder="Vlr. unit." type="number" value={it.valorUnitario} onChange={(e) => updateItem(idx, { valorUnitario: e.target.value })} />
                {ing && ing.precoAtual > 0 && it.valorUnitario && Number(it.valorUnitario) > ing.precoAtual * 1.15 && (
                  <Badge tone="warning">Acima da média</Badge>
                )}
                <button onClick={() => removeItem(idx)} className="text-nord-gray hover:text-nord-danger">
                  <Trash2 size={14} />
                </button>
              </div>
            );
          })}
          <button onClick={addItem} className="btn-outline">
            <Plus size={13} /> Adicionar item
          </button>
        </div>

        {error && <p className="text-xs text-nord-danger mt-3">{error}</p>}
        <button onClick={submit} disabled={submitting} className="btn-primary w-full mt-4 py-2.5">
          {submitting ? "Registrando..." : "Registrar compra"}
        </button>
      </Modal>

      <Modal open={!!editing} onClose={() => setEditing(null)} title={`Editar compra — ${editing?.supplierName ?? ""}`} widthClass="max-w-3xl">
        {editing && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4">
              <label className="block md:col-span-2">
                <span className="block text-xs text-nord-gray mb-1">Fornecedor</span>
                <select className="input" value={editForm.supplierId} onChange={(e) => setEditForm({ ...editForm, supplierId: e.target.value })}>
                  <option value="">Selecione...</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="block text-xs text-nord-gray mb-1">Data</span>
                <input className="input" type="date" value={editForm.data} onChange={(e) => setEditForm({ ...editForm, data: e.target.value })} />
              </label>
              <label className="block">
                <span className="block text-xs text-nord-gray mb-1">Previsão de entrega</span>
                <input className="input" type="date" value={editForm.previsaoEntrega} onChange={(e) => setEditForm({ ...editForm, previsaoEntrega: e.target.value })} />
              </label>
              <label className="block md:col-span-2">
                <span className="block text-xs text-nord-gray mb-1">Comprador responsável</span>
                <input className="input" value={editForm.compradorResponsavel} onChange={(e) => setEditForm({ ...editForm, compradorResponsavel: e.target.value })} />
              </label>
              <label className="block">
                <span className="block text-xs text-nord-gray mb-1">Forma de pagamento</span>
                <select className="input" value={editForm.formaPagamento} onChange={(e) => setEditForm({ ...editForm, formaPagamento: e.target.value })}>
                  <option value="">Selecione...</option>
                  {PURCHASE_PAYMENT_METHODS.map((m) => (
                    <option key={m} value={m}>{PAYMENT_METHOD_LABEL[m]}</option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="block text-xs text-nord-gray mb-1">Vencimento</span>
                <input className="input" type="date" value={editForm.dataVencimento} onChange={(e) => setEditForm({ ...editForm, dataVencimento: e.target.value })} />
              </label>
              <label className="block">
                <span className="block text-xs text-nord-gray mb-1">Desconto (R$)</span>
                <input className="input" type="number" value={editForm.desconto} onChange={(e) => setEditForm({ ...editForm, desconto: e.target.value })} />
              </label>
              <label className="block">
                <span className="block text-xs text-nord-gray mb-1">Frete (R$)</span>
                <input className="input" type="number" value={editForm.frete} onChange={(e) => setEditForm({ ...editForm, frete: e.target.value })} />
              </label>
            </div>

            <div className="space-y-2">
              <span className="block text-xs text-nord-gray">
                Itens do pedido — só é possível ajustar quantidade e valor unitário. Para adicionar ou remover produtos, registre uma nova compra.
              </span>
              {editItens.map((it, idx) => {
                const valorLinha = (Number(it.quantidade) || 0) * (Number(it.valorUnitario) || 0);
                const acimaMedia = it.precoMedioAtual > 0 && it.valorUnitario !== "" && Number(it.valorUnitario) > it.precoMedioAtual * 1.15;
                return (
                  <div key={it.id} className="flex items-center gap-2 nord-card bg-nord-panel/40 px-3 py-2">
                    <span className="flex-1 text-sm text-white truncate">{it.ingredientName}</span>
                    <input
                      className="input w-20"
                      placeholder="Qtd."
                      type="number"
                      value={it.quantidade}
                      onChange={(e) => updateEditItem(idx, { quantidade: e.target.value })}
                    />
                    <span className="text-xs text-nord-gray w-12 shrink-0 text-center">{it.unidade}</span>
                    <span className="text-nord-gray text-xs">×</span>
                    <input
                      className="input w-28"
                      placeholder="Vlr. unit."
                      type="number"
                      value={it.valorUnitario}
                      onChange={(e) => updateEditItem(idx, { valorUnitario: e.target.value })}
                    />
                    {acimaMedia && <Badge tone="warning">Acima da média</Badge>}
                    <span className="text-nord-gray text-xs">=</span>
                    <span className="w-24 text-sm text-white text-right shrink-0">{formatCurrency(valorLinha)}</span>
                  </div>
                );
              })}
            </div>

            {editError && <p className="text-xs text-nord-danger mt-3">{editError}</p>}
            <button onClick={submitEdit} disabled={editSubmitting} className="btn-primary w-full mt-4 py-2.5">
              {editSubmitting ? "Salvando..." : "Salvar alterações"}
            </button>
          </>
        )}
      </Modal>

      <Modal open={!!detail} onClose={() => setDetail(null)} title={`Compra — ${detail?.supplierName ?? ""}`} widthClass="max-w-2xl">
        {detail && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
              <div><span className="text-nord-gray text-xs block">Data</span><span className="text-white">{format(new Date(detail.data), "dd/MM/yyyy")}</span></div>
              <div><span className="text-nord-gray text-xs block">Nota fiscal</span><span className="text-white">{detail.numeroNota ?? "—"}</span></div>
              <div><span className="text-nord-gray text-xs block">Comprador</span><span className="text-white">{detail.compradorResponsavel ?? "—"}</span></div>
              <div><span className="text-nord-gray text-xs block">Status</span><Badge tone={PURCHASE_STATUS_TONE[detail.status]}>{PURCHASE_STATUS_LABEL[detail.status]}</Badge></div>
              <div><span className="text-nord-gray text-xs block">Frete</span><span className="text-white">{formatCurrency(detail.frete)}</span></div>
              <div><span className="text-nord-gray text-xs block">Desconto</span><span className="text-white">{formatCurrency(detail.desconto)}</span></div>
            </div>
            <div className="space-y-1.5">
              {detail.items.map((it) => (
                <div key={it.id} className="flex items-center justify-between text-sm border-b border-nord-border/60 pb-1.5 last:border-0">
                  <span className="text-white">{it.ingredientName}</span>
                  <span className="text-nord-gray">
                    {formatNumber(it.quantidade)} {it.unidade} × {formatCurrency(it.valorUnitario)} = {formatCurrency(it.valorTotal)}
                  </span>
                </div>
              ))}
            </div>
            <div className="flex justify-between text-sm font-medium pt-2 border-t border-nord-border">
              <span className="text-white">Total</span>
              <span className="text-white">{formatCurrency(detail.valorTotal)}</span>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
