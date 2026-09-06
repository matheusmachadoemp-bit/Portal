"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, CheckCircle2, Copy, CheckCheck } from "lucide-react";
import { formatCurrency } from "@/lib/calc";

type NewItem = { ingredientId: string; quantidade: string; unidade: string; valorUnitario: string };

const emptyItem: NewItem = { ingredientId: "", quantidade: "", unidade: "", valorUnitario: "" };

export function NovoPedidoClient({
  suppliers,
  ingredients,
  users,
}: {
  suppliers: { id: string; name: string }[];
  ingredients: { id: string; name: string; unidade: string; unidadeCompra: string | null; precoAtual: number }[];
  users: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [supplierId, setSupplierId] = useState("");
  const [data, setData] = useState(new Date().toISOString().slice(0, 10));
  const [previsaoEntrega, setPrevisaoEntrega] = useState("");
  const [responsavelRecebimentoId, setResponsavelRecebimentoId] = useState("");
  const [numeroNota, setNumeroNota] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [itens, setItens] = useState<NewItem[]>([{ ...emptyItem }]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [success, setSuccess] = useState<{ id: string; numero: string; link: string; supplierName: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const valorTotalPedido = itens.reduce((s, it) => s + (Number(it.quantidade) || 0) * (Number(it.valorUnitario) || 0), 0);

  function addItem() {
    setItens([...itens, { ...emptyItem }]);
  }
  function updateItem(idx: number, patch: Partial<NewItem>) {
    setItens(itens.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  }
  function removeItem(idx: number) {
    setItens(itens.filter((_, i) => i !== idx));
  }

  async function submit(enviarParaRecebimento: boolean) {
    setError(null);
    const validItens = itens.filter((it) => it.ingredientId && it.quantidade && it.valorUnitario);
    if (!supplierId || validItens.length === 0) {
      setError("Selecione o fornecedor e informe ao menos um item válido.");
      return;
    }
    if (enviarParaRecebimento && !responsavelRecebimentoId) {
      setError("Selecione o responsável pelo recebimento antes de enviar.");
      return;
    }
    setSaving(true);
    const res = await fetch("/api/estoque/compras", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        supplierId,
        numeroNota,
        data,
        previsaoEntrega: previsaoEntrega || null,
        responsavelRecebimentoId: responsavelRecebimentoId || null,
        observacoes,
        itens: validItens,
        enviarParaRecebimento,
      }),
    });
    setSaving(false);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.error ?? "Não foi possível registrar o pedido.");
      return;
    }
    const { purchase } = await res.json();
    if (enviarParaRecebimento && purchase.recebimentoToken) {
      const supplierName = suppliers.find((s) => s.id === supplierId)?.name ?? "";
      setSuccess({
        id: purchase.id,
        numero: purchase.id.slice(-5).toUpperCase(),
        link: `${window.location.origin}/recebimento/${purchase.recebimentoToken}`,
        supplierName,
      });
    } else {
      router.push("/portal/estoque/recebimento");
    }
  }

  async function copyLink() {
    if (!success) return;
    await navigator.clipboard.writeText(success.link);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  if (success) {
    const whatsappText = encodeURIComponent(
      `Olá! Segue o link para realizar o recebimento da mercadoria.\n\nPedido #${success.numero}\nFornecedor: ${success.supplierName}\n\n${success.link}`
    );
    return (
      <div className="nord-card p-6 max-w-lg mx-auto text-center space-y-4">
        <CheckCircle2 size={40} className="text-nord-success mx-auto" />
        <div>
          <h2 className="text-white font-semibold text-lg">Pedido criado com sucesso!</h2>
          <p className="text-nord-gray text-sm mt-1">O pedido #{success.numero} foi enviado para recebimento.</p>
        </div>
        <div className="nord-card bg-nord-panel p-3 text-left space-y-2">
          <p className="text-xs text-nord-gray">Envie este link para o responsável realizar a conferência de recebimento.</p>
          <div className="flex items-center gap-2">
            <input readOnly value={success.link} className="input flex-1 text-xs" />
            <button onClick={copyLink} className="btn-outline shrink-0">
              {copied ? <CheckCheck size={13} /> : <Copy size={13} />} {copied ? "Copiado!" : "Copiar"}
            </button>
          </div>
        </div>
        <a
          href={`https://wa.me/?text=${whatsappText}`}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-primary w-full py-2.5 flex items-center justify-center gap-2"
        >
          Enviar por WhatsApp
        </a>
        <button
          onClick={() => router.push("/portal/estoque/recebimento")}
          className="w-full py-2.5 text-sm text-nord-gray hover:text-white"
        >
          Voltar para o início
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 nord-card p-4">
        <label className="block">
          <span className="block text-xs text-nord-gray mb-1">Fornecedor *</span>
          <select className="input" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
            <option value="">Selecione...</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="block text-xs text-nord-gray mb-1">Data do pedido *</span>
          <input className="input" type="date" value={data} onChange={(e) => setData(e.target.value)} />
        </label>
        <label className="block">
          <span className="block text-xs text-nord-gray mb-1">Previsão de entrega *</span>
          <input className="input" type="date" value={previsaoEntrega} onChange={(e) => setPrevisaoEntrega(e.target.value)} />
        </label>
        <label className="block md:col-span-2">
          <span className="block text-xs text-nord-gray mb-1">Responsável pelo recebimento *</span>
          <select className="input" value={responsavelRecebimentoId} onChange={(e) => setResponsavelRecebimentoId(e.target.value)}>
            <option value="">Selecione...</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="block text-xs text-nord-gray mb-1">Nº do pedido / referência</span>
          <input className="input" value={numeroNota} onChange={(e) => setNumeroNota(e.target.value)} />
        </label>
        <label className="block md:col-span-3">
          <span className="block text-xs text-nord-gray mb-1">Observações</span>
          <input className="input" value={observacoes} onChange={(e) => setObservacoes(e.target.value)} />
        </label>
      </div>

      <div className="nord-card p-4 space-y-3">
        <span className="block text-sm text-white font-medium">Produtos</span>
        <div className="space-y-2">
          {itens.map((it, idx) => {
            const ing = ingredients.find((i) => i.id === it.ingredientId);
            const valorLinha = (Number(it.quantidade) || 0) * (Number(it.valorUnitario) || 0);
            return (
              <div key={idx} className="flex items-center gap-2">
                <select
                  className="input flex-1"
                  value={it.ingredientId}
                  onChange={(e) => {
                    const selected = ingredients.find((i) => i.id === e.target.value);
                    updateItem(idx, {
                      ingredientId: e.target.value,
                      unidade: selected?.unidadeCompra ?? selected?.unidade ?? "",
                      valorUnitario: selected?.precoAtual ? String(selected.precoAtual) : it.valorUnitario,
                    });
                  }}
                >
                  <option value="">Produto...</option>
                  {ingredients.map((i) => (
                    <option key={i.id} value={i.id}>{i.name}</option>
                  ))}
                </select>
                <input className="input w-24" placeholder="Qtde" type="number" value={it.quantidade} onChange={(e) => updateItem(idx, { quantidade: e.target.value })} />
                <input className="input w-28" placeholder="Unidade" value={it.unidade} onChange={(e) => updateItem(idx, { unidade: e.target.value })} />
                <input className="input w-28" placeholder="Preço (R$)" type="number" value={it.valorUnitario} onChange={(e) => updateItem(idx, { valorUnitario: e.target.value })} />
                <span className="w-28 text-sm text-nord-gray text-right shrink-0">{formatCurrency(valorLinha)}</span>
                {ing && ing.precoAtual > 0 && it.valorUnitario && Number(it.valorUnitario) > ing.precoAtual * 1.15 && (
                  <span className="text-[10px] text-nord-warning shrink-0">Acima da média</span>
                )}
                <button onClick={() => removeItem(idx)} className="text-nord-gray hover:text-red-400 shrink-0">
                  <Trash2 size={14} />
                </button>
              </div>
            );
          })}
        </div>
        <button onClick={addItem} className="btn-outline">
          <Plus size={13} /> Adicionar produto
        </button>

        <div className="flex justify-end pt-2 border-t border-nord-border">
          <div className="text-right">
            <span className="block text-xs text-nord-gray">Valor total do pedido</span>
            <span className="text-white text-lg font-semibold">{formatCurrency(valorTotalPedido)}</span>
          </div>
        </div>
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}

      <div className="flex items-center gap-3">
        <button onClick={() => submit(false)} disabled={saving} className="btn-outline flex-1 py-2.5">
          Salvar rascunho
        </button>
        <button onClick={() => submit(true)} disabled={saving} className="btn-primary flex-1 py-2.5">
          Enviar para recebimento
        </button>
      </div>
    </div>
  );
}
