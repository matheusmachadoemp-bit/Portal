"use client";

import { useMemo, useState } from "react";
import { Star } from "lucide-react";
import { Section, Badge } from "@/components/ui/stat-card";
import { Modal } from "@/components/ui/modal";
import { Toolbar } from "@/components/ui/toolbar";
import { format } from "date-fns";

type Supplier = {
  id: string;
  razaoSocial: string;
  nomeFantasia: string | null;
  cnpj: string | null;
  telefone: string | null;
  whatsapp: string | null;
  email: string | null;
  endereco: string | null;
  prazoPagamentoDias: number | null;
  prazoEntregaDias: number | null;
  pedidoMinimo: number | null;
  avaliacao: number;
  active: boolean;
  observacao: string | null;
  produtos: number;
  compras: number;
  ultimaCompra: string | null;
};

const emptyForm = {
  id: "",
  razaoSocial: "",
  nomeFantasia: "",
  cnpj: "",
  telefone: "",
  whatsapp: "",
  email: "",
  endereco: "",
  prazoPagamentoDias: "",
  prazoEntregaDias: "",
  pedidoMinimo: "",
  avaliacao: "5",
  observacao: "",
};

export function FornecedoresClient({ initialSuppliers, canCreate }: { initialSuppliers: Supplier[]; canCreate: boolean }) {
  const [suppliers, setSuppliers] = useState(initialSuppliers);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState(emptyForm);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filtered = useMemo(
    () => suppliers.filter((s) => (s.nomeFantasia ?? s.razaoSocial).toLowerCase().includes(search.toLowerCase())),
    [suppliers, search]
  );

  const ranking = useMemo(() => [...suppliers].sort((a, b) => b.avaliacao - a.avaliacao).slice(0, 5), [suppliers]);

  async function refresh() {
    const res = await fetch("/api/estoque/fornecedores");
    const data = await res.json();
    setSuppliers(
      data.suppliers.map((s: Record<string, unknown>) => ({
        ...s,
        produtos: (s._count as { ingredients: number }).ingredients,
        compras: (s._count as { purchases: number }).purchases,
        ultimaCompra: (s.purchases as { data: string }[])[0]?.data ?? null,
      }))
    );
  }

  function openEdit(s: Supplier) {
    setForm({
      id: s.id,
      razaoSocial: s.razaoSocial,
      nomeFantasia: s.nomeFantasia ?? "",
      cnpj: s.cnpj ?? "",
      telefone: s.telefone ?? "",
      whatsapp: s.whatsapp ?? "",
      email: s.email ?? "",
      endereco: s.endereco ?? "",
      prazoPagamentoDias: s.prazoPagamentoDias !== null ? String(s.prazoPagamentoDias) : "",
      prazoEntregaDias: s.prazoEntregaDias !== null ? String(s.prazoEntregaDias) : "",
      pedidoMinimo: s.pedidoMinimo !== null ? String(s.pedidoMinimo) : "",
      avaliacao: String(s.avaliacao),
      observacao: s.observacao ?? "",
    });
    setError(null);
    setShowForm(true);
  }

  async function submit() {
    setError(null);
    const isEdit = !!form.id;
    const res = await fetch(isEdit ? `/api/estoque/fornecedores/${form.id}` : "/api/estoque/fornecedores", {
      method: isEdit ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Não foi possível salvar o fornecedor.");
      return;
    }
    setShowForm(false);
    setForm(emptyForm);
    refresh();
  }

  return (
    <div className="space-y-6">
      <Section title="Ranking de fornecedores (avaliação)">
        <div className="space-y-2">
          {ranking.map((s, idx) => (
            <div key={s.id} className="flex items-center justify-between text-sm border-b border-nord-border/60 pb-2 last:border-0">
              <span className="text-white">
                {idx + 1}. {s.nomeFantasia ?? s.razaoSocial}
              </span>
              <span className="flex items-center gap-1 text-amber-400 text-xs">
                <Star size={12} fill="currentColor" /> {s.avaliacao.toFixed(1)}
              </span>
            </div>
          ))}
        </div>
      </Section>

      <Section
        title="Fornecedores"
        action={
          <Toolbar
            filters={<input className="input w-56" placeholder="Buscar fornecedor..." value={search} onChange={(e) => setSearch(e.target.value)} />}
            exportFilename="fornecedores"
            exportSheetName="Fornecedores"
            exportRows={() =>
              filtered.map((s) => ({
                Fornecedor: s.nomeFantasia ?? s.razaoSocial,
                CNPJ: s.cnpj ?? "",
                Telefone: s.telefone ?? "",
                "Prazo pagamento (dias)": s.prazoPagamentoDias ?? "",
                "Prazo entrega (dias)": s.prazoEntregaDias ?? "",
                Avaliação: s.avaliacao,
                Produtos: s.produtos,
              }))
            }
            onRefresh={refresh}
            onAdd={canCreate ? () => { setForm(emptyForm); setError(null); setShowForm(true); } : undefined}
            addLabel="Novo fornecedor"
          />
        }
      >
        <div className="overflow-x-auto nord-scrollbar">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-nord-gray border-b border-nord-border">
                <th className="py-2 pr-4">Fornecedor</th>
                <th className="py-2 pr-4">Contato</th>
                <th className="py-2 pr-4">Prazo pagto.</th>
                <th className="py-2 pr-4">Prazo entrega</th>
                <th className="py-2 pr-4">Pedido mín.</th>
                <th className="py-2 pr-4">Avaliação</th>
                <th className="py-2 pr-4">Última compra</th>
                <th className="py-2 pr-4">Produtos</th>
                <th className="py-2 pr-4" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => (
                <tr key={s.id} className="border-b border-nord-border/50 hover:bg-white/5">
                  <td className="py-2.5 pr-4 text-white">
                    {s.nomeFantasia ?? s.razaoSocial}
                    {!s.active && <Badge tone="default"> Inativo</Badge>}
                  </td>
                  <td className="py-2.5 pr-4 text-nord-gray">{s.telefone ?? s.whatsapp ?? s.email ?? "—"}</td>
                  <td className="py-2.5 pr-4 text-nord-gray">{s.prazoPagamentoDias ? `${s.prazoPagamentoDias} dias` : "—"}</td>
                  <td className="py-2.5 pr-4 text-nord-gray">{s.prazoEntregaDias ? `${s.prazoEntregaDias} dias` : "—"}</td>
                  <td className="py-2.5 pr-4 text-nord-gray">{s.pedidoMinimo ? `R$ ${s.pedidoMinimo}` : "—"}</td>
                  <td className="py-2.5 pr-4">
                    <span className="flex items-center gap-1 text-amber-400 text-xs">
                      <Star size={12} fill="currentColor" /> {s.avaliacao.toFixed(1)}
                    </span>
                  </td>
                  <td className="py-2.5 pr-4 text-nord-gray">{s.ultimaCompra ? format(new Date(s.ultimaCompra), "dd/MM/yyyy") : "—"}</td>
                  <td className="py-2.5 pr-4 text-nord-gray">{s.produtos}</td>
                  <td className="py-2.5 pr-4 text-right">
                    {canCreate && (
                      <button onClick={() => openEdit(s)} className="text-xs text-nord-blue-light hover:underline">
                        Editar
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={9} className="py-6 text-center text-nord-gray">
                    Nenhum fornecedor encontrado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Section>

      <Modal open={showForm} onClose={() => setShowForm(false)} title={form.id ? "Editar fornecedor" : "Novo fornecedor"} widthClass="max-w-xl">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <label className="block md:col-span-2">
            <span className="block text-xs text-nord-gray mb-1">Razão social</span>
            <input className="input" value={form.razaoSocial} onChange={(e) => setForm({ ...form, razaoSocial: e.target.value })} />
          </label>
          <label className="block">
            <span className="block text-xs text-nord-gray mb-1">Nome fantasia</span>
            <input className="input" value={form.nomeFantasia} onChange={(e) => setForm({ ...form, nomeFantasia: e.target.value })} />
          </label>
          <label className="block">
            <span className="block text-xs text-nord-gray mb-1">CNPJ</span>
            <input className="input" value={form.cnpj} onChange={(e) => setForm({ ...form, cnpj: e.target.value })} />
          </label>
          <label className="block">
            <span className="block text-xs text-nord-gray mb-1">Telefone</span>
            <input className="input" value={form.telefone} onChange={(e) => setForm({ ...form, telefone: e.target.value })} />
          </label>
          <label className="block">
            <span className="block text-xs text-nord-gray mb-1">WhatsApp</span>
            <input className="input" value={form.whatsapp} onChange={(e) => setForm({ ...form, whatsapp: e.target.value })} />
          </label>
          <label className="block">
            <span className="block text-xs text-nord-gray mb-1">E-mail</span>
            <input className="input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </label>
          <label className="block md:col-span-2">
            <span className="block text-xs text-nord-gray mb-1">Endereço</span>
            <input className="input" value={form.endereco} onChange={(e) => setForm({ ...form, endereco: e.target.value })} />
          </label>
          <label className="block">
            <span className="block text-xs text-nord-gray mb-1">Prazo de pagamento (dias)</span>
            <input className="input" type="number" value={form.prazoPagamentoDias} onChange={(e) => setForm({ ...form, prazoPagamentoDias: e.target.value })} />
          </label>
          <label className="block">
            <span className="block text-xs text-nord-gray mb-1">Prazo médio de entrega (dias)</span>
            <input className="input" type="number" value={form.prazoEntregaDias} onChange={(e) => setForm({ ...form, prazoEntregaDias: e.target.value })} />
          </label>
          <label className="block">
            <span className="block text-xs text-nord-gray mb-1">Pedido mínimo (R$)</span>
            <input className="input" type="number" value={form.pedidoMinimo} onChange={(e) => setForm({ ...form, pedidoMinimo: e.target.value })} />
          </label>
          <label className="block">
            <span className="block text-xs text-nord-gray mb-1">Avaliação (0 a 5)</span>
            <input className="input" type="number" min="0" max="5" step="0.1" value={form.avaliacao} onChange={(e) => setForm({ ...form, avaliacao: e.target.value })} />
          </label>
          <label className="block md:col-span-2">
            <span className="block text-xs text-nord-gray mb-1">Observação</span>
            <input className="input" value={form.observacao} onChange={(e) => setForm({ ...form, observacao: e.target.value })} />
          </label>
        </div>
        {error && <p className="text-xs text-red-400 mt-3">{error}</p>}
        <button onClick={submit} disabled={!form.razaoSocial.trim()} className="btn-primary w-full mt-4 py-2.5">
          Salvar
        </button>
      </Modal>
    </div>
  );
}
