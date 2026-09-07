"use client";

import { useState } from "react";
import { format } from "date-fns";
import { Section, Badge } from "@/components/ui/stat-card";
import { Modal, FormError } from "@/components/ui/modal";
import { Toolbar } from "@/components/ui/toolbar";
import { formatCurrency, formatNumber } from "@/lib/calc";
import {
  RECEIVING_ITEM_DIVERGENCE_LABEL,
  RECEIVING_ITEM_RESOLUTION_LABEL,
  RECEIVING_ITEM_RESOLUTION_TONE,
} from "@/lib/estoque";

type Item = {
  id: string;
  status: string;
  quantidadeRecebida: number | null;
  precoInformado: number | null;
  fotoUrl: string | null;
  divergenciaTipos: string | null;
  divergenciaDescricao: string | null;
  resolucaoTipo: string;
  resolucaoDataPrevista: string | null;
  resolucaoValorCredito: number | null;
  resolucaoObservacao: string | null;
  resolvidoPorNome: string | null;
  resolvidoEm: string | null;
  purchaseId: string;
  data: string;
  supplierName: string;
  ingredientName: string;
  quantidadePedida: number;
  unidade: string;
  valorUnitario: number;
};

const RESOLUCAO_OPTIONS = [
  { value: "FORNECEDOR_REPOSICAO", label: "Fornecedor fará reposição" },
  { value: "FORNECEDOR_CREDITO", label: "Fornecedor dará crédito" },
  { value: "PRODUTO_DEVOLVIDO", label: "Produto devolvido" },
  { value: "DIFERENCA_ACEITA", label: "Diferença aceita" },
  { value: "OUTRA", label: "Outra solução" },
];

function valorDiferenca(item: Item) {
  const qtdDif = (item.quantidadeRecebida ?? 0) - item.quantidadePedida;
  const precoRef = item.precoInformado ?? item.valorUnitario;
  return qtdDif * precoRef;
}

export function DivergenciasClient({ initialItems, canResolve }: { initialItems: Item[]; canResolve: boolean }) {
  const [items, setItems] = useState(initialItems);
  const [resolvendo, setResolvendo] = useState<Item | null>(null);
  const [tipo, setTipo] = useState("FORNECEDOR_REPOSICAO");
  const [dataPrevista, setDataPrevista] = useState("");
  const [valorCredito, setValorCredito] = useState("");
  const [observacao, setObservacao] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    const res = await fetch("/api/estoque/recebimento/divergencias");
    const data = await res.json();
    setItems(
      data.items.map((it: Record<string, unknown>) => ({
        id: it.id,
        status: it.status,
        quantidadeRecebida: it.quantidadeRecebida,
        precoInformado: it.precoInformado,
        fotoUrl: it.fotoUrl,
        divergenciaTipos: it.divergenciaTipos,
        divergenciaDescricao: it.divergenciaDescricao,
        resolucaoTipo: it.resolucaoTipo,
        resolucaoDataPrevista: it.resolucaoDataPrevista,
        resolucaoValorCredito: it.resolucaoValorCredito,
        resolucaoObservacao: it.resolucaoObservacao,
        resolvidoPorNome: (it.resolvidoPor as { name: string } | null)?.name ?? null,
        resolvidoEm: it.resolvidoEm,
        purchaseId: (it.receiving as { purchase: { id: string } }).purchase.id,
        data: (it.receiving as { purchase: { data: string } }).purchase.data,
        supplierName:
          (it.receiving as { purchase: { supplier: { nomeFantasia: string | null; razaoSocial: string } } }).purchase.supplier
            .nomeFantasia ?? (it.receiving as { purchase: { supplier: { razaoSocial: string } } }).purchase.supplier.razaoSocial,
        ingredientName: (it.purchaseItem as { ingredient: { name: string } }).ingredient.name,
        quantidadePedida: (it.purchaseItem as { quantidade: number }).quantidade,
        unidade: (it.purchaseItem as { unidade: string }).unidade,
        valorUnitario: (it.purchaseItem as { valorUnitario: number }).valorUnitario,
      }))
    );
  }

  function openResolver(item: Item) {
    setResolvendo(item);
    setTipo("FORNECEDOR_REPOSICAO");
    setDataPrevista("");
    setValorCredito("");
    setObservacao("");
    setError(null);
  }

  async function confirmarResolucao() {
    if (!resolvendo) return;
    setError(null);
    const res = await fetch(`/api/estoque/recebimento/divergencias/${resolvendo.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        resolucaoTipo: tipo,
        resolucaoDataPrevista: dataPrevista || null,
        resolucaoValorCredito: valorCredito || null,
        resolucaoObservacao: observacao || null,
      }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.error ?? "Não foi possível registrar a resolução.");
      return;
    }
    setResolvendo(null);
    refresh();
  }

  const pendentes = items.filter((it) => it.resolucaoTipo === "AGUARDANDO");
  const resolvidas = items.filter((it) => it.resolucaoTipo !== "AGUARDANDO");

  return (
    <div className="space-y-6">
      <Section title="Divergências pendentes" action={<Toolbar onRefresh={refresh} />}>
        <div className="overflow-x-auto nord-scrollbar">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-nord-gray border-b border-nord-border">
                <th className="py-2 pr-4">Data</th>
                <th className="py-2 pr-4">Fornecedor</th>
                <th className="py-2 pr-4">Produto</th>
                <th className="py-2 pr-4">Pedido × Recebido</th>
                <th className="py-2 pr-4">Tipo</th>
                <th className="py-2 pr-4">Diferença</th>
                <th className="py-2 pr-4">Foto</th>
                <th className="py-2 pr-4" />
              </tr>
            </thead>
            <tbody>
              {pendentes.map((it) => (
                <tr key={it.id} className="border-b border-nord-border/50 hover:bg-white/5">
                  <td className="py-2.5 pr-4 text-nord-gray">{format(new Date(it.data), "dd/MM/yyyy")}</td>
                  <td className="py-2.5 pr-4 text-white">{it.supplierName}</td>
                  <td className="py-2.5 pr-4 text-white">{it.ingredientName}</td>
                  <td className="py-2.5 pr-4 text-nord-gray">
                    {formatNumber(it.quantidadePedida)} × {it.quantidadeRecebida != null ? formatNumber(it.quantidadeRecebida) : "—"} {it.unidade}
                  </td>
                  <td className="py-2.5 pr-4 text-nord-gray">
                    {it.divergenciaTipos
                      ? it.divergenciaTipos.split(",").map((t) => RECEIVING_ITEM_DIVERGENCE_LABEL[t] ?? t).join(", ")
                      : "—"}
                  </td>
                  <td className={`py-2.5 pr-4 ${valorDiferenca(it) < 0 ? "text-red-400" : "text-nord-gray"}`}>
                    {formatCurrency(valorDiferenca(it))}
                  </td>
                  <td className="py-2.5 pr-4">
                    {it.fotoUrl ? (
                      <a href={it.fotoUrl} target="_blank" rel="noopener noreferrer" className="text-nord-blue-light hover:underline text-xs">
                        Ver foto
                      </a>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="py-2.5 pr-4 text-right">
                    {canResolve && (
                      <button onClick={() => openResolver(it)} className="text-xs text-nord-blue-light hover:underline">
                        Resolver
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {pendentes.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-6 text-center text-nord-gray">
                    Nenhuma divergência pendente.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="Divergências resolvidas">
        <div className="overflow-x-auto nord-scrollbar">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-nord-gray border-b border-nord-border">
                <th className="py-2 pr-4">Data</th>
                <th className="py-2 pr-4">Fornecedor</th>
                <th className="py-2 pr-4">Produto</th>
                <th className="py-2 pr-4">Solução</th>
                <th className="py-2 pr-4">Resolvido por</th>
              </tr>
            </thead>
            <tbody>
              {resolvidas.map((it) => (
                <tr key={it.id} className="border-b border-nord-border/50 hover:bg-white/5">
                  <td className="py-2.5 pr-4 text-nord-gray">{format(new Date(it.data), "dd/MM/yyyy")}</td>
                  <td className="py-2.5 pr-4 text-white">{it.supplierName}</td>
                  <td className="py-2.5 pr-4 text-white">{it.ingredientName}</td>
                  <td className="py-2.5 pr-4">
                    <Badge tone={RECEIVING_ITEM_RESOLUTION_TONE[it.resolucaoTipo] ?? "default"}>
                      {RECEIVING_ITEM_RESOLUTION_LABEL[it.resolucaoTipo] ?? it.resolucaoTipo}
                    </Badge>
                  </td>
                  <td className="py-2.5 pr-4 text-nord-gray">
                    {it.resolvidoPorNome ?? "—"} {it.resolvidoEm ? `em ${format(new Date(it.resolvidoEm), "dd/MM/yyyy")}` : ""}
                  </td>
                </tr>
              ))}
              {resolvidas.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-nord-gray">
                    Nenhuma divergência resolvida ainda.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Section>

      <Modal open={!!resolvendo} onClose={() => setResolvendo(null)} title={`Resolver divergência — ${resolvendo?.ingredientName ?? ""}`} widthClass="max-w-lg">
        {resolvendo && (
          <div className="space-y-4">
            <label className="block">
              <span className="block text-xs text-nord-gray mb-1">Solução</span>
              <select className="input" value={tipo} onChange={(e) => setTipo(e.target.value)}>
                {RESOLUCAO_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </label>
            {tipo === "FORNECEDOR_REPOSICAO" && (
              <label className="block">
                <span className="block text-xs text-nord-gray mb-1">Previsão da reposição</span>
                <input type="date" className="input" value={dataPrevista} onChange={(e) => setDataPrevista(e.target.value)} />
              </label>
            )}
            {tipo === "FORNECEDOR_CREDITO" && (
              <label className="block">
                <span className="block text-xs text-nord-gray mb-1">Valor do crédito (R$)</span>
                <input type="number" step="0.01" className="input" value={valorCredito} onChange={(e) => setValorCredito(e.target.value)} />
              </label>
            )}
            <label className="block">
              <span className="block text-xs text-nord-gray mb-1">Observação</span>
              <textarea className="input" rows={3} value={observacao} onChange={(e) => setObservacao(e.target.value)} />
            </label>
            <FormError message={error} />
            <button onClick={confirmarResolucao} className="btn-primary w-full py-2.5">
              Confirmar resolução
            </button>
          </div>
        )}
      </Modal>
    </div>
  );
}
