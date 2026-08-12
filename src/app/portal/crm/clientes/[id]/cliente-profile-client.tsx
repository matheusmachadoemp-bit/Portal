"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Trash2, Check, X } from "lucide-react";
import { Section, StatCard, Badge } from "@/components/ui/stat-card";
import { DynamicIcon } from "@/components/dynamic-icon";
import { formatCurrency, formatNumber } from "@/lib/calc";
import { STATUS_LABEL, STATUS_TONE, frequenciaLabel, type ClienteStatus } from "@/lib/crm";
import { SALE_CHANNEL_LABEL } from "@/lib/vendas-analytics";

type ClienteInfo = {
  id: string;
  nome: string;
  telefone: string | null;
  whatsapp: string | null;
  email: string | null;
  dataNascimento: string | null;
  endereco: string | null;
  bairro: string | null;
  cidade: string | null;
  lojaNome: string;
  lojaColor: string;
};

type Metrics = {
  pedidos: number;
  totalGasto: number;
  ticketMedio: number;
  status: ClienteStatus;
  ultimaCompra: string | null;
  diasDesdeUltimaCompra: number | null;
  frequenciaMediaDias: number | null;
};

type Preferencias = {
  produtoFavorito: string | null;
  categoriaFavorita: string | null;
  canalFavorito: string | null;
  diaFavorito: string | null;
  horarioFavorito: string | null;
};

type Venda = {
  id: string;
  dateTime: string;
  valorTotal: number;
  channel: string;
  items: { nome: string; quantidade: number }[];
};

type Nota = { id: string; texto: string; autor: string; createdAt: string };

export function ClienteProfileClient({
  cliente,
  metrics,
  preferencias,
  vendas,
  notas: notasIniciais,
}: {
  cliente: ClienteInfo;
  metrics: Metrics;
  preferencias: Preferencias;
  vendas: Venda[];
  notas: Nota[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    whatsapp: cliente.whatsapp ?? "",
    email: cliente.email ?? "",
    dataNascimento: cliente.dataNascimento ?? "",
    endereco: cliente.endereco ?? "",
    bairro: cliente.bairro ?? "",
    cidade: cliente.cidade ?? "",
  });
  const [notas, setNotas] = useState(notasIniciais);
  const [novaNota, setNovaNota] = useState("");
  const [savingNota, setSavingNota] = useState(false);

  async function salvarPerfil() {
    setSaving(true);
    await fetch(`/api/crm/clientes/${cliente.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setSaving(false);
    setEditing(false);
    router.refresh();
  }

  async function adicionarNota() {
    if (!novaNota.trim()) return;
    setSavingNota(true);
    const res = await fetch(`/api/crm/clientes/${cliente.id}/notas`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ texto: novaNota }),
    });
    if (res.ok) {
      const { nota } = await res.json();
      setNotas((prev) => [{ id: nota.id, texto: nota.texto, autor: nota.author.name, createdAt: nota.createdAt }, ...prev]);
      setNovaNota("");
    }
    setSavingNota(false);
  }

  async function excluirNota(id: string) {
    await fetch(`/api/crm/clientes/${cliente.id}/notas/${id}`, { method: "DELETE" });
    setNotas((prev) => prev.filter((n) => n.id !== id));
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-nord-blue/15 flex items-center justify-center text-nord-blue-light font-semibold text-lg">
            {cliente.nome.charAt(0).toUpperCase()}
          </div>
          <div>
            <h2 className="text-white text-lg font-semibold">{cliente.nome}</h2>
            <div className="flex items-center gap-2 mt-0.5">
              <Badge tone={STATUS_TONE[metrics.status]}>{STATUS_LABEL[metrics.status]}</Badge>
              <span className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: `${cliente.lojaColor}22`, color: cliente.lojaColor }}>
                {cliente.lojaNome}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Total gasto" value={formatCurrency(metrics.totalGasto)} icon="Wallet" color="#22c55e" />
        <StatCard label="Pedidos" value={formatNumber(metrics.pedidos)} icon="ShoppingBag" />
        <StatCard label="Ticket médio" value={formatCurrency(metrics.ticketMedio)} icon="Receipt" />
        <StatCard label="LTV" value={formatCurrency(metrics.totalGasto)} icon="TrendingUp" color="#a855f7" />
        <StatCard
          label="Última compra"
          value={metrics.ultimaCompra ? new Date(metrics.ultimaCompra).toLocaleDateString("pt-BR") : "—"}
          icon="Calendar"
          hint={metrics.diasDesdeUltimaCompra !== null ? `${metrics.diasDesdeUltimaCompra} dias atrás` : undefined}
        />
        <StatCard label="Frequência média" value={frequenciaLabel(metrics.frequenciaMediaDias)} icon="Clock" />
        <StatCard label="Dias desde última compra" value={metrics.diasDesdeUltimaCompra !== null ? `${metrics.diasDesdeUltimaCompra}d` : "—"} icon="History" />
        <StatCard label="Cadastro" value={cliente.lojaNome} icon="Store" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-1 space-y-4">
          <Section
            title="Dados pessoais"
            action={
              editing ? (
                <div className="flex gap-1.5">
                  <button onClick={salvarPerfil} disabled={saving} className="text-emerald-400 hover:text-emerald-300">
                    <Check size={15} />
                  </button>
                  <button onClick={() => setEditing(false)} className="text-nord-gray hover:text-white">
                    <X size={15} />
                  </button>
                </div>
              ) : (
                <button onClick={() => setEditing(true)} className="text-nord-gray hover:text-white">
                  <Pencil size={14} />
                </button>
              )
            }
          >
            {!editing ? (
              <dl className="space-y-2.5 text-sm">
                <Field label="Telefone" value={cliente.telefone} />
                <Field label="WhatsApp" value={cliente.whatsapp} />
                <Field label="E-mail" value={cliente.email} />
                <Field label="Data de nascimento" value={cliente.dataNascimento ? new Date(cliente.dataNascimento + "T00:00:00").toLocaleDateString("pt-BR") : null} />
                <Field label="Endereço" value={cliente.endereco} />
                <Field label="Bairro" value={cliente.bairro} />
                <Field label="Cidade" value={cliente.cidade} />
                <Field label="Loja preferida" value={cliente.lojaNome} />
              </dl>
            ) : (
              <div className="space-y-2.5">
                <EditField label="WhatsApp" value={form.whatsapp} onChange={(v) => setForm((f) => ({ ...f, whatsapp: v }))} />
                <EditField label="E-mail" value={form.email} onChange={(v) => setForm((f) => ({ ...f, email: v }))} />
                <EditField label="Data de nascimento" type="date" value={form.dataNascimento} onChange={(v) => setForm((f) => ({ ...f, dataNascimento: v }))} />
                <EditField label="Endereço" value={form.endereco} onChange={(v) => setForm((f) => ({ ...f, endereco: v }))} />
                <EditField label="Bairro" value={form.bairro} onChange={(v) => setForm((f) => ({ ...f, bairro: v }))} />
                <EditField label="Cidade" value={form.cidade} onChange={(v) => setForm((f) => ({ ...f, cidade: v }))} />
              </div>
            )}
          </Section>

          <Section title="Preferências">
            <dl className="space-y-2.5 text-sm">
              <Field label="Produto favorito" value={preferencias.produtoFavorito} />
              <Field label="Categoria favorita" value={preferencias.categoriaFavorita} />
              <Field label="Canal" value={preferencias.canalFavorito ? SALE_CHANNEL_LABEL[preferencias.canalFavorito] ?? preferencias.canalFavorito : null} />
              <Field label="Dia preferido" value={preferencias.diaFavorito} />
              <Field label="Horário preferido" value={preferencias.horarioFavorito} />
            </dl>
          </Section>

          <Section title="Notas internas">
            <div className="space-y-3">
              <div className="flex gap-2">
                <input
                  value={novaNota}
                  onChange={(e) => setNovaNota(e.target.value)}
                  placeholder="Registrar observação sobre este cliente..."
                  className="flex-1 bg-nord-panel border border-nord-border rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-nord-blue"
                />
                <button onClick={adicionarNota} disabled={savingNota || !novaNota.trim()} className="px-3 py-2 rounded-lg text-xs bg-nord-blue hover:bg-nord-blue-light disabled:opacity-50 text-white font-medium">
                  Adicionar
                </button>
              </div>
              <div className="space-y-2 max-h-64 overflow-y-auto nord-scrollbar">
                {notas.map((n) => (
                  <div key={n.id} className="p-2.5 rounded-lg bg-nord-panel/60 border border-nord-border/50">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-xs text-white">{n.texto}</p>
                      <button onClick={() => excluirNota(n.id)} className="text-nord-gray hover:text-red-400 shrink-0">
                        <Trash2 size={12} />
                      </button>
                    </div>
                    <p className="text-[10px] text-nord-gray mt-1">
                      {n.autor} · {new Date(n.createdAt).toLocaleDateString("pt-BR")}
                    </p>
                  </div>
                ))}
                {notas.length === 0 && <p className="text-xs text-nord-gray text-center py-3">Nenhuma nota registrada.</p>}
              </div>
            </div>
          </Section>
        </div>

        <div className="lg:col-span-2">
          <Section title="Histórico de pedidos">
            <div className="space-y-3 max-h-[720px] overflow-y-auto nord-scrollbar">
              {vendas.map((v) => (
                <div key={v.id} className="flex gap-3 pb-3 border-b border-nord-border/50 last:border-0">
                  <div className="w-8 h-8 rounded-lg bg-nord-blue/15 flex items-center justify-center shrink-0 mt-0.5">
                    <DynamicIcon name="ShoppingBag" size={14} className="text-nord-blue-light" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <p className="text-sm text-white font-medium">
                        {new Date(v.dateTime).toLocaleDateString("pt-BR")} · {formatCurrency(v.valorTotal)}
                      </p>
                      <Badge tone="default">{SALE_CHANNEL_LABEL[v.channel] ?? v.channel}</Badge>
                    </div>
                    <p className="text-xs text-nord-gray mt-0.5">
                      {v.items.map((i) => `${i.quantidade > 1 ? `${i.quantidade}x ` : ""}${i.nome}`).join(", ") || "Sem itens detalhados"}
                    </p>
                  </div>
                </div>
              ))}
              {vendas.length === 0 && <p className="text-sm text-nord-gray text-center py-6">Nenhum pedido registrado ainda.</p>}
            </div>
          </Section>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <dt className="text-nord-gray text-xs">{label}</dt>
      <dd className="text-white text-xs text-right">{value || "—"}</dd>
    </div>
  );
}

function EditField({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <div>
      <label className="block text-[11px] text-nord-gray mb-1">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-nord-panel border border-nord-border rounded-lg px-2.5 py-1.5 text-xs text-white outline-none focus:border-nord-blue"
      />
    </div>
  );
}
