"use client";

import { useState } from "react";
import { Plus, Trash2, X } from "lucide-react";
import { Section, Badge } from "@/components/ui/stat-card";
import { Modal, ConfirmDialog } from "@/components/ui/modal";
import { formatCurrency } from "@/lib/calc";
import { format } from "date-fns";
import { PAYMENT_METHOD_LABEL, SALE_CHANNEL_LABEL, SALE_PAYMENT_METHODS } from "@/lib/vendas-analytics";

type ProductOption = { id: string; name: string; category: string; precoVenda: number };
type EmployeeOption = { id: string; name: string };
type SaleItemDTO = { id: string; nome: string; quantidade: number; precoUnitario: number; faturamento: number };
type SaleDTO = {
  id: string;
  dateTime: string;
  channel: string;
  formaPagamento: string;
  garcomId: string | null;
  garcomName: string | null;
  mesaNumero: string | null;
  bairro: string | null;
  regiao: string | null;
  valorTotal: number;
  items: SaleItemDTO[];
};

type ItemLine = { key: string; productId: string; nome: string; categoria: string; quantidade: string; precoUnitario: string };

function newKey() {
  return Math.random().toString(36).slice(2);
}

const emptyForm = {
  dateTime: format(new Date(), "yyyy-MM-dd'T'HH:mm"),
  channel: "SALAO",
  formaPagamento: "PIX",
  garcomId: "",
  mesaNumero: "",
  bairro: "",
  regiao: "",
  clienteNome: "",
  clienteTelefone: "",
};

export function LancamentosClient({
  initialSales,
  products,
  employees,
  canCreate,
}: {
  initialSales: SaleDTO[];
  products: ProductOption[];
  employees: EmployeeOption[];
  canCreate: boolean;
}) {
  const [sales, setSales] = useState(initialSales);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [lines, setLines] = useState<ItemLine[]>([]);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    const res = await fetch("/api/vendas/lancamentos");
    const data = await res.json();
    setSales(
      data.sales.map((s: { id: string; dateTime: string; channel: string; formaPagamento: string; garcomId: string | null; garcom: { name: string } | null; mesaNumero: string | null; bairro: string | null; regiao: string | null; valorTotal: number; items: SaleItemDTO[] }) => ({
        id: s.id,
        dateTime: s.dateTime,
        channel: s.channel,
        formaPagamento: s.formaPagamento,
        garcomId: s.garcomId,
        garcomName: s.garcom?.name ?? null,
        mesaNumero: s.mesaNumero,
        bairro: s.bairro,
        regiao: s.regiao,
        valorTotal: s.valorTotal,
        items: s.items,
      }))
    );
  }

  function openNew() {
    setForm(emptyForm);
    setLines([{ key: newKey(), productId: products[0]?.id ?? "", nome: products[0]?.name ?? "", categoria: products[0]?.category ?? "", quantidade: "1", precoUnitario: String(products[0]?.precoVenda ?? "") }]);
    setError(null);
    setShowForm(true);
  }

  function addLine() {
    setLines((l) => [...l, { key: newKey(), productId: products[0]?.id ?? "", nome: products[0]?.name ?? "", categoria: products[0]?.category ?? "", quantidade: "1", precoUnitario: String(products[0]?.precoVenda ?? "") }]);
  }

  function removeLine(key: string) {
    setLines((l) => l.filter((line) => line.key !== key));
  }

  function updateLine(key: string, patch: Partial<ItemLine>) {
    setLines((l) => l.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  }

  function selectProduct(key: string, productId: string) {
    const p = products.find((prod) => prod.id === productId);
    updateLine(key, { productId, nome: p?.name ?? "", categoria: p?.category ?? "", precoUnitario: String(p?.precoVenda ?? "") });
  }

  const total = lines.reduce((sum, l) => sum + (Number(l.quantidade) || 0) * (Number(l.precoUnitario) || 0), 0);

  async function submit() {
    setError(null);
    const res = await fetch("/api/vendas/lancamentos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        garcomId: form.garcomId || null,
        items: lines.filter((l) => l.nome && l.quantidade),
      }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Não foi possível registrar a venda.");
      return;
    }
    setShowForm(false);
    refresh();
  }

  async function doDelete() {
    if (!confirmDeleteId) return;
    await fetch(`/api/vendas/lancamentos/${confirmDeleteId}`, { method: "DELETE" });
    setConfirmDeleteId(null);
    refresh();
  }

  return (
    <Section
      title="Lançamentos de venda"
      action={
        canCreate ? (
          <button
            onClick={openNew}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-nord-blue hover:bg-nord-blue-light text-white font-medium"
          >
            <Plus size={13} /> Lançar venda
          </button>
        ) : undefined
      }
    >
      {!canCreate && (
        <p className="mb-4 text-xs text-amber-400 bg-amber-950/20 border border-amber-900/40 rounded-lg px-3 py-2">
          Você está no modo Grupo Nord (consolidado). Selecione uma loja específica no menu lateral para lançar vendas.
        </p>
      )}

      <div className="overflow-x-auto nord-scrollbar">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-nord-gray border-b border-nord-border">
              <th className="py-2 pr-4">Data/Hora</th>
              <th className="py-2 pr-4">Canal</th>
              <th className="py-2 pr-4">Pagamento</th>
              <th className="py-2 pr-4">Garçom</th>
              <th className="py-2 pr-4">Itens</th>
              <th className="py-2 pr-4">Total</th>
              <th className="py-2 pr-4"></th>
            </tr>
          </thead>
          <tbody>
            {sales.map((s) => (
              <tr key={s.id} className="border-b border-nord-border/50 hover:bg-white/5">
                <td className="py-2.5 pr-4 text-nord-gray">{format(new Date(s.dateTime), "dd/MM/yyyy HH:mm")}</td>
                <td className="py-2.5 pr-4">
                  <Badge>{SALE_CHANNEL_LABEL[s.channel]}</Badge>
                </td>
                <td className="py-2.5 pr-4 text-nord-gray">{PAYMENT_METHOD_LABEL[s.formaPagamento]}</td>
                <td className="py-2.5 pr-4 text-nord-gray">{s.garcomName ?? "-"}</td>
                <td className="py-2.5 pr-4 text-nord-gray">{s.items.length}</td>
                <td className="py-2.5 pr-4 text-white font-medium">{formatCurrency(s.valorTotal)}</td>
                <td className="py-2.5 pr-4">
                  {canCreate && (
                    <button onClick={() => setConfirmDeleteId(s.id)} className="text-nord-gray hover:text-red-400">
                      <Trash2 size={14} />
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {sales.length === 0 && (
              <tr>
                <td colSpan={7} className="py-6 text-center text-nord-gray">
                  Nenhuma venda lançada ainda.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal open={showForm} onClose={() => setShowForm(false)} title="Lançar venda" widthClass="max-w-2xl">
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="block text-xs text-nord-gray mb-1">Data e hora</span>
            <input type="datetime-local" value={form.dateTime} onChange={(e) => setForm({ ...form, dateTime: e.target.value })} className="input" />
          </label>
          <label className="block">
            <span className="block text-xs text-nord-gray mb-1">Canal</span>
            <select value={form.channel} onChange={(e) => setForm({ ...form, channel: e.target.value })} className="input">
              {Object.entries(SALE_CHANNEL_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="block text-xs text-nord-gray mb-1">Forma de pagamento</span>
            <select value={form.formaPagamento} onChange={(e) => setForm({ ...form, formaPagamento: e.target.value })} className="input">
              {SALE_PAYMENT_METHODS.map((k) => (
                <option key={k} value={k}>
                  {PAYMENT_METHOD_LABEL[k]}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="block text-xs text-nord-gray mb-1">Garçom (opcional)</span>
            <select value={form.garcomId} onChange={(e) => setForm({ ...form, garcomId: e.target.value })} className="input">
              <option value="">—</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="block text-xs text-nord-gray mb-1">Telefone do cliente (opcional, para CRM/RFV)</span>
            <input value={form.clienteTelefone} onChange={(e) => setForm({ ...form, clienteTelefone: e.target.value })} className="input" placeholder="(11) 99999-9999" />
          </label>
          {form.clienteTelefone && (
            <label className="block">
              <span className="block text-xs text-nord-gray mb-1">Nome do cliente</span>
              <input value={form.clienteNome} onChange={(e) => setForm({ ...form, clienteNome: e.target.value })} className="input" />
            </label>
          )}
          {form.channel !== "DELIVERY" && (
            <label className="block">
              <span className="block text-xs text-nord-gray mb-1">Mesa (opcional)</span>
              <input value={form.mesaNumero} onChange={(e) => setForm({ ...form, mesaNumero: e.target.value })} className="input" />
            </label>
          )}
          {form.channel === "DELIVERY" && (
            <>
              <label className="block">
                <span className="block text-xs text-nord-gray mb-1">Bairro</span>
                <input value={form.bairro} onChange={(e) => setForm({ ...form, bairro: e.target.value })} className="input" />
              </label>
              <label className="block">
                <span className="block text-xs text-nord-gray mb-1">Região</span>
                <input value={form.regiao} onChange={(e) => setForm({ ...form, regiao: e.target.value })} className="input" />
              </label>
            </>
          )}
        </div>

        <div className="mt-5">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm text-white font-medium">Itens</h4>
            <button onClick={addLine} className="text-xs text-nord-blue-light hover:underline">
              + adicionar item
            </button>
          </div>
          <div className="space-y-2">
            {lines.map((line) => (
              <div key={line.key} className="grid grid-cols-12 gap-2 items-center">
                <select
                  value={line.productId}
                  onChange={(e) => selectProduct(line.key, e.target.value)}
                  className="input col-span-6"
                >
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  placeholder="Qtd."
                  value={line.quantidade}
                  onChange={(e) => updateLine(line.key, { quantidade: e.target.value })}
                  className="input col-span-2"
                />
                <input
                  type="number"
                  placeholder="Preço unit."
                  value={line.precoUnitario}
                  onChange={(e) => updateLine(line.key, { precoUnitario: e.target.value })}
                  className="input col-span-3"
                />
                <button onClick={() => removeLine(line.key)} className="col-span-1 text-nord-gray hover:text-red-400">
                  <X size={14} />
                </button>
              </div>
            ))}
            {products.length === 0 && (
              <p className="text-xs text-nord-gray">Cadastre produtos em Ficha Técnica para lançar vendas por item.</p>
            )}
          </div>
          <div className="mt-3 flex justify-end text-sm text-nord-gray">
            Total: <span className="text-white font-medium ml-1">{formatCurrency(total)}</span>
          </div>
        </div>

        {error && <p className="text-xs text-red-400 mt-2">{error}</p>}
        <button
          onClick={submit}
          disabled={lines.length === 0}
          className="w-full mt-4 bg-nord-blue hover:bg-nord-blue-light disabled:opacity-50 text-white text-sm font-medium rounded-lg py-2.5"
        >
          Salvar venda
        </button>
      </Modal>

      <ConfirmDialog
        open={!!confirmDeleteId}
        title="Excluir venda"
        message="Tem certeza que deseja excluir este lançamento de venda?"
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
    </Section>
  );
}
