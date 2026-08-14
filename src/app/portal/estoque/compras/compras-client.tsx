"use client";

import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Section, Badge, StatCard } from "@/components/ui/stat-card";
import { Modal } from "@/components/ui/modal";
import { Toolbar } from "@/components/ui/toolbar";
import { formatCurrency, formatNumber } from "@/lib/calc";
import { format } from "date-fns";
import { PURCHASE_STATUS, PURCHASE_STATUS_LABEL, PURCHASE_STATUS_TONE } from "@/lib/estoque";

type Item = { id: string; ingredientId: string; ingredientName: string; unidade: string; quantidade: number; valorUnitario: number; valorTotal: number; precoMedioAtual: number };
type Purchase = {
  id: string;
  numeroNota: string | null;
  data: string;
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

export function ComprasClient({
  initialPurchases,
  suppliers,
  ingredients,
  canCreate,
}: {
  initialPurchases: Purchase[];
  suppliers: { id: string; name: string }[];
  ingredients: { id: string; name: string; unidade: string; unidadeCompra: string | null; precoAtual: number }[];
  canCreate: boolean;
}) {
  const [purchases, setPurchases] = useState(initialPurchases);
  const [statusFilter, setStatusFilter] = useState("");
  const [supplierFilter, setSupplierFilter] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<Purchase | null>(null);

  const [supplierId, setSupplierId] = useState("");
  const [numeroNota, setNumeroNota] = useState("");
  const [data, setData] = useState(new Date().toISOString().slice(0, 10));
  const [frete, setFrete] = useState("0");
  const [desconto, setDesconto] = useState("0");
  const [itens, setItens] = useState<NewItem[]>([{ ingredientId: "", quantidade: "", unidade: "", valorUnitario: "" }]);

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
  const pendentes = purchases.filter((p) => p.status === "PEDIDO_REALIZADO" || p.status === "AGUARDANDO_ENTREGA").length;

  async function refresh() {
    const res = await fetch("/api/estoque/compras");
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
    setError(null);
    const validItens = itens.filter((it) => it.ingredientId && it.quantidade && it.valorUnitario);
    if (!supplierId || validItens.length === 0) {
      setError("Selecione o fornecedor e informe ao menos um item válido.");
      return;
    }
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
  }

  async function marcarRecebido(p: Purchase) {
    await fetch(`/api/estoque/compras/${p.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "RECEBIDO" }),
    });
    refresh();
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <StatCard label="Compras no filtro" value={String(filtered.length)} icon="ShoppingBasket" />
        <StatCard label="Valor total" value={formatCurrency(valorTotalPeriodo)} icon="DollarSign" color="#22c55e" />
        <StatCard label="Aguardando entrega" value={String(pendentes)} icon="Truck" color={pendentes ? "#f59e0b" : "#22c55e"} />
      </div>

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
                      {canCreate && !p.recebido && p.status !== "CANCELADO" && (
                        <button onClick={() => marcarRecebido(p)} className="text-xs text-emerald-400 hover:underline">
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
                <button onClick={() => removeItem(idx)} className="text-nord-gray hover:text-red-400">
                  <Trash2 size={14} />
                </button>
              </div>
            );
          })}
          <button onClick={addItem} className="btn-outline">
            <Plus size={13} /> Adicionar item
          </button>
        </div>

        {error && <p className="text-xs text-red-400 mt-3">{error}</p>}
        <button onClick={submit} className="btn-primary w-full mt-4 py-2.5">
          Registrar compra
        </button>
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
