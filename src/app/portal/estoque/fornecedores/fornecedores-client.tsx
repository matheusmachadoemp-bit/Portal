"use client";

import { useMemo, useState } from "react";
import { Section, Badge } from "@/components/ui/stat-card";
import { Modal } from "@/components/ui/modal";
import { Toolbar } from "@/components/ui/toolbar";
import { format } from "date-fns";
import { formatCurrency } from "@/lib/calc";

/**
 * Mesmo vocabulário de dia da semana usado no resto do projeto (0=domingo..6=sábado — ver
 * `StoreClosedWeekday`/`ProductionWeekdayWeight`/`WEEKDAY_LABELS` em
 * `src/app/api/rh/escala-folgas/closed-weekdays/route.ts`), repetido aqui porque este é um
 * componente client e aquele é um arquivo de rota de API.
 */
const WEEKDAY_LABELS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
const WEEKDAY_SHORT_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

/** Exibição compacta dos dias de entrega na tabela e no export (ex.: "Seg, Qua, Sex"). */
function formatDiasEntregaSemana(dias: number[]): string {
  if (dias.length === 0) return "—";
  if (dias.length === 7) return "Todos os dias";
  return [...dias]
    .sort((a, b) => a - b)
    .map((d) => WEEKDAY_SHORT_LABELS[d])
    .join(", ");
}

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
  diasEntregaSemana: number[];
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
  diasEntregaSemana: [] as number[],
  observacao: "",
};

export function FornecedoresClient({ initialSuppliers, canCreate }: { initialSuppliers: Supplier[]; canCreate: boolean }) {
  const [suppliers, setSuppliers] = useState(initialSuppliers);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState(emptyForm);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [historicoSupplier, setHistoricoSupplier] = useState<Supplier | null>(null);
  const [historico, setHistorico] = useState<{
    totalRecebimentos: number;
    taxaConformidade: number | null;
    valorDivergencias: number;
    taxaAtraso: number | null;
  } | null>(null);

  const filtered = useMemo(
    () => suppliers.filter((s) => (s.nomeFantasia ?? s.razaoSocial).toLowerCase().includes(search.toLowerCase())),
    [suppliers, search]
  );

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

  async function abrirHistorico(s: Supplier) {
    setHistoricoSupplier(s);
    setHistorico(null);
    const res = await fetch(`/api/estoque/fornecedores/${s.id}/historico-recebimento`);
    if (!res.ok) return;
    const data = await res.json();
    setHistorico(data.historico);
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
      diasEntregaSemana: s.diasEntregaSemana,
      observacao: s.observacao ?? "",
    });
    setError(null);
    setShowForm(true);
  }

  function toggleDiaEntrega(dia: number) {
    setForm((f) => ({
      ...f,
      diasEntregaSemana: f.diasEntregaSemana.includes(dia)
        ? f.diasEntregaSemana.filter((d) => d !== dia)
        : [...f.diasEntregaSemana, dia].sort((a, b) => a - b),
    }));
  }

  async function submit() {
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
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
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
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
                "Dias de entrega": formatDiasEntregaSemana(s.diasEntregaSemana),
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
                <th className="py-2 pr-4">Dias de entrega</th>
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
                  <td className="py-2.5 pr-4 text-nord-gray">{formatDiasEntregaSemana(s.diasEntregaSemana)}</td>
                  <td className="py-2.5 pr-4 text-nord-gray">{s.ultimaCompra ? format(new Date(s.ultimaCompra), "dd/MM/yyyy") : "—"}</td>
                  <td className="py-2.5 pr-4 text-nord-gray">{s.produtos}</td>
                  <td className="py-2.5 pr-4 text-right space-x-2 whitespace-nowrap">
                    <button onClick={() => abrirHistorico(s)} className="text-xs text-nord-gray hover:text-white">
                      Histórico de recebimento
                    </button>
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
                  <td colSpan={7} className="py-6 text-center text-nord-gray">
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
          <div className="block md:col-span-2">
            <span className="block text-xs text-nord-gray mb-1">Dias de entrega</span>
            <div className="flex flex-wrap gap-2">
              {WEEKDAY_LABELS.map((label, dia) => {
                const selected = form.diasEntregaSemana.includes(dia);
                return (
                  <button
                    key={dia}
                    type="button"
                    onClick={() => toggleDiaEntrega(dia)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                      selected
                        ? "bg-nord-blue border-nord-blue text-white"
                        : "border-nord-border text-nord-gray hover:text-white hover:bg-white/5"
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
          <label className="block md:col-span-2">
            <span className="block text-xs text-nord-gray mb-1">Observação</span>
            <input className="input" value={form.observacao} onChange={(e) => setForm({ ...form, observacao: e.target.value })} />
          </label>
        </div>
        {error && <p className="text-xs text-nord-danger mt-3">{error}</p>}
        <button onClick={submit} disabled={!form.razaoSocial.trim() || submitting} className="btn-primary w-full mt-4 py-2.5">
          {submitting ? "Salvando..." : "Salvar"}
        </button>
      </Modal>

      <Modal
        open={!!historicoSupplier}
        onClose={() => setHistoricoSupplier(null)}
        title={`Histórico de recebimento — ${historicoSupplier?.nomeFantasia ?? historicoSupplier?.razaoSocial ?? ""}`}
        widthClass="max-w-lg"
      >
        {!historico ? (
          <p className="text-center text-nord-gray py-4">Carregando...</p>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <div className="nord-card p-3">
              <p className="text-xs text-nord-gray">Recebimentos registrados</p>
              <p className="text-white text-xl font-semibold">{historico.totalRecebimentos}</p>
            </div>
            <div className="nord-card p-3">
              <p className="text-xs text-nord-gray">Taxa de conformidade</p>
              <p className="text-white text-xl font-semibold">
                {historico.taxaConformidade != null ? `${historico.taxaConformidade.toFixed(0)}%` : "—"}
              </p>
            </div>
            <div className="nord-card p-3">
              <p className="text-xs text-nord-gray">Valor acumulado em divergências</p>
              <p className="text-white text-xl font-semibold">{formatCurrency(historico.valorDivergencias)}</p>
            </div>
            <div className="nord-card p-3">
              <p className="text-xs text-nord-gray">Taxa de atraso na entrega</p>
              <p className="text-white text-xl font-semibold">
                {historico.taxaAtraso != null ? `${historico.taxaAtraso.toFixed(0)}%` : "—"}
              </p>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
