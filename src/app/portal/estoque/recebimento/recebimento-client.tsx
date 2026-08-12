"use client";

import { useState } from "react";
import { Section, Badge } from "@/components/ui/stat-card";
import { Modal } from "@/components/ui/modal";
import { Toolbar } from "@/components/ui/toolbar";
import { formatNumber } from "@/lib/calc";
import { format } from "date-fns";
import { RECEIVING_DIVERGENCE_LABEL, RECEIVING_STATUS, RECEIVING_STATUS_LABEL, RECEIVING_STATUS_TONE } from "@/lib/estoque";

type PendingItem = { id: string; ingredientId: string; ingredientName: string; unidade: string; quantidade: number };
type Pending = { id: string; numeroNota: string | null; data: string; supplierName: string; items: PendingItem[] };
type Receiving = {
  id: string;
  dataHora: string;
  responsavel: string | null;
  status: string;
  divergencias: string | null;
  observacao: string | null;
  supplierName: string;
  numeroNota: string | null;
};

const DIVERGENCE_KEYS = Object.keys(RECEIVING_DIVERGENCE_LABEL);

export function RecebimentoClient({
  initialPendentes,
  initialRecebimentos,
  canCreate,
}: {
  initialPendentes: Pending[];
  initialRecebimentos: Receiving[];
  canCreate: boolean;
}) {
  const [pendentes, setPendentes] = useState(initialPendentes);
  const [recebimentos, setRecebimentos] = useState(initialRecebimentos);
  const [conferindo, setConferindo] = useState<Pending | null>(null);
  const [responsavel, setResponsavel] = useState("");
  const [status, setStatus] = useState("APROVADO");
  const [divergencias, setDivergencias] = useState<string[]>([]);
  const [observacao, setObservacao] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    const res = await fetch("/api/estoque/recebimento");
    const data = await res.json();
    setPendentes(
      data.pendentes.map((p: Record<string, unknown>) => ({
        id: p.id,
        numeroNota: p.numeroNota,
        data: p.data,
        supplierName: (p.supplier as { nomeFantasia: string | null; razaoSocial: string }).nomeFantasia ?? (p.supplier as { razaoSocial: string }).razaoSocial,
        items: (p.items as Record<string, unknown>[]).map((it) => ({
          id: it.id,
          ingredientId: it.ingredientId,
          ingredientName: (it.ingredient as { name: string }).name,
          unidade: it.unidade,
          quantidade: it.quantidade,
        })),
      }))
    );
    setRecebimentos(
      data.recebimentos.map((r: Record<string, unknown>) => ({
        id: r.id,
        dataHora: r.dataHora,
        responsavel: r.responsavel,
        status: r.status,
        divergencias: r.divergencias,
        observacao: r.observacao,
        supplierName: (r.purchase as { supplier: { nomeFantasia: string | null; razaoSocial: string } }).supplier.nomeFantasia ?? (r.purchase as { supplier: { razaoSocial: string } }).supplier.razaoSocial,
        numeroNota: (r.purchase as { numeroNota: string | null }).numeroNota,
      }))
    );
  }

  function openConferencia(p: Pending) {
    setConferindo(p);
    setResponsavel("");
    setStatus("APROVADO");
    setDivergencias([]);
    setObservacao("");
    setError(null);
  }

  function toggleDivergencia(key: string) {
    setDivergencias((prev) => (prev.includes(key) ? prev.filter((d) => d !== key) : [...prev, key]));
  }

  async function confirmar() {
    if (!conferindo) return;
    setError(null);
    const res = await fetch("/api/estoque/recebimento", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ purchaseId: conferindo.id, responsavel, status, divergencias, observacao }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.error ?? "Não foi possível registrar o recebimento.");
      return;
    }
    setConferindo(null);
    refresh();
  }

  return (
    <div className="space-y-6">
      <Section title="Pedidos aguardando recebimento" action={<Toolbar onRefresh={refresh} />}>
        <div className="overflow-x-auto nord-scrollbar">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-nord-gray border-b border-nord-border">
                <th className="py-2 pr-4">Data do pedido</th>
                <th className="py-2 pr-4">Fornecedor</th>
                <th className="py-2 pr-4">Nota fiscal</th>
                <th className="py-2 pr-4">Itens</th>
                <th className="py-2 pr-4" />
              </tr>
            </thead>
            <tbody>
              {pendentes.map((p) => (
                <tr key={p.id} className="border-b border-nord-border/50 hover:bg-white/5">
                  <td className="py-2.5 pr-4 text-nord-gray">{format(new Date(p.data), "dd/MM/yyyy")}</td>
                  <td className="py-2.5 pr-4 text-white">{p.supplierName}</td>
                  <td className="py-2.5 pr-4 text-nord-gray">{p.numeroNota ?? "—"}</td>
                  <td className="py-2.5 pr-4 text-nord-gray">{p.items.length} item(ns)</td>
                  <td className="py-2.5 pr-4 text-right">
                    {canCreate && (
                      <button onClick={() => openConferencia(p)} className="text-xs text-nord-blue-light hover:underline">
                        Conferir recebimento
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {pendentes.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-nord-gray">
                    Nenhum pedido aguardando recebimento.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="Histórico de recebimentos">
        <div className="overflow-x-auto nord-scrollbar">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-nord-gray border-b border-nord-border">
                <th className="py-2 pr-4">Data</th>
                <th className="py-2 pr-4">Fornecedor</th>
                <th className="py-2 pr-4">Responsável</th>
                <th className="py-2 pr-4">Status</th>
                <th className="py-2 pr-4">Divergências</th>
              </tr>
            </thead>
            <tbody>
              {recebimentos.map((r) => (
                <tr key={r.id} className="border-b border-nord-border/50 hover:bg-white/5">
                  <td className="py-2.5 pr-4 text-nord-gray">{format(new Date(r.dataHora), "dd/MM/yyyy HH:mm")}</td>
                  <td className="py-2.5 pr-4 text-white">{r.supplierName}</td>
                  <td className="py-2.5 pr-4 text-nord-gray">{r.responsavel ?? "—"}</td>
                  <td className="py-2.5 pr-4">
                    <Badge tone={RECEIVING_STATUS_TONE[r.status]}>{RECEIVING_STATUS_LABEL[r.status] ?? r.status}</Badge>
                  </td>
                  <td className="py-2.5 pr-4 text-nord-gray">
                    {r.divergencias
                      ? r.divergencias
                          .split(",")
                          .map((d) => RECEIVING_DIVERGENCE_LABEL[d] ?? d)
                          .join(", ")
                      : "—"}
                  </td>
                </tr>
              ))}
              {recebimentos.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-nord-gray">
                    Nenhum recebimento registrado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Section>

      <Modal open={!!conferindo} onClose={() => setConferindo(null)} title={`Conferência — ${conferindo?.supplierName ?? ""}`} widthClass="max-w-2xl">
        {conferindo && (
          <div className="space-y-4">
            <div className="space-y-1.5">
              {conferindo.items.map((it) => (
                <div key={it.id} className="flex items-center justify-between text-sm border-b border-nord-border/60 pb-1.5 last:border-0">
                  <span className="text-white">{it.ingredientName}</span>
                  <span className="text-nord-gray">
                    Pedido: {formatNumber(it.quantidade)} {it.unidade}
                  </span>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <label className="block">
                <span className="block text-xs text-nord-gray mb-1">Responsável pelo recebimento</span>
                <input className="input" value={responsavel} onChange={(e) => setResponsavel(e.target.value)} />
              </label>
              <label className="block">
                <span className="block text-xs text-nord-gray mb-1">Status da conferência</span>
                <select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
                  {RECEIVING_STATUS.map((s) => (
                    <option key={s} value={s}>{RECEIVING_STATUS_LABEL[s]}</option>
                  ))}
                </select>
              </label>
            </div>
            <div>
              <span className="block text-xs text-nord-gray mb-1.5">Divergências identificadas</span>
              <div className="flex flex-wrap gap-2">
                {DIVERGENCE_KEYS.map((key) => (
                  <label key={key} className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs cursor-pointer ${divergencias.includes(key) ? "border-nord-blue text-white bg-nord-blue/10" : "border-nord-border text-nord-gray"}`}>
                    <input type="checkbox" className="hidden" checked={divergencias.includes(key)} onChange={() => toggleDivergencia(key)} />
                    {RECEIVING_DIVERGENCE_LABEL[key]}
                  </label>
                ))}
              </div>
            </div>
            <label className="block">
              <span className="block text-xs text-nord-gray mb-1">Observação</span>
              <input className="input" value={observacao} onChange={(e) => setObservacao(e.target.value)} />
            </label>
            {error && <p className="text-xs text-red-400">{error}</p>}
            <button onClick={confirmar} className="btn-primary w-full py-2.5">
              Confirmar recebimento
            </button>
          </div>
        )}
      </Modal>
    </div>
  );
}
