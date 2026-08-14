"use client";

import { useState } from "react";
import { Section, Badge, ProgressBar } from "@/components/ui/stat-card";
import { Modal } from "@/components/ui/modal";
import { Toolbar } from "@/components/ui/toolbar";
import { formatCurrency, formatNumber } from "@/lib/calc";
import { format } from "date-fns";
import { COUNT_ITEM_STATUS_LABEL, COUNT_ITEM_STATUS_TONE, COUNT_STATUS_LABEL, COUNT_STATUS_TONE, SECTORS } from "@/lib/estoque";

type CountRow = {
  id: string;
  setor: string | null;
  semana: number | null;
  ano: number;
  dataContagem: string;
  responsavel: string | null;
  horaInicio: string | null;
  horaFim: string | null;
  status: string;
  totalItens: number;
  conferidos: number;
  divergencias: number;
  createdByName: string;
};

type CountItem = {
  id: string;
  ingredientId: string;
  setor: string | null;
  estoqueEsperado: number;
  quantidadeContada: number | null;
  diferencaQtd: number | null;
  diferencaPercent: number | null;
  diferencaReais: number | null;
  status: string;
  observacao: string | null;
  justificativa: string | null;
  ingredient: { name: string; unidade: string; precoAtual: number; quantidadeEmbalagem: number; categoryId: string | null };
};

export function ContagemSemanalClient({ initialCounts, canCreate }: { initialCounts: CountRow[]; canCreate: boolean }) {
  const [counts, setCounts] = useState(initialCounts);
  const [showNew, setShowNew] = useState(false);
  const [setor, setSetor] = useState<string>(SECTORS[0]);
  const [responsavel, setResponsavel] = useState("");
  const [error, setError] = useState<string | null>(null);

  const [active, setActive] = useState<CountRow | null>(null);
  const [items, setItems] = useState<CountItem[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [summary, setSummary] = useState<{ esperado: number; contado: number } | null>(null);

  async function refreshList() {
    const res = await fetch("/api/estoque/contagens?type=SEMANAL");
    const data = await res.json();
    setCounts(
      data.counts.map((c: Record<string, unknown>) => ({
        id: c.id,
        setor: c.setor,
        semana: c.semana,
        ano: c.ano,
        dataContagem: c.dataContagem,
        responsavel: c.responsavel,
        horaInicio: c.horaInicio,
        horaFim: c.horaFim,
        status: c.status,
        totalItens: (c.items as unknown[]).length,
        conferidos: (c.items as { quantidadeContada: number | null }[]).filter((i) => i.quantidadeContada !== null).length,
        divergencias: (c.items as { status: string }[]).filter((i) => i.status === "DIVERGENCIA").length,
        createdByName: (c.createdBy as { name: string }).name,
      }))
    );
  }

  async function iniciarContagem() {
    setError(null);
    const res = await fetch("/api/estoque/contagens", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "SEMANAL", setor, responsavel }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.error ?? "Não foi possível iniciar a contagem.");
      return;
    }
    setShowNew(false);
    await refreshList();
  }

  async function abrirContagem(c: CountRow) {
    setActive(c);
    setSummary(null);
    setLoadingDetail(true);
    const res = await fetch(`/api/estoque/contagens/${c.id}`);
    const data = await res.json();
    setItems(data.count.items);
    setLoadingDetail(false);
  }

  function updateLocal(itemId: string, quantidade: string) {
    setItems((prev) =>
      prev.map((it) => {
        if (it.id !== itemId) return it;
        const q = quantidade === "" ? null : Number(quantidade);
        return { ...it, quantidadeContada: q };
      })
    );
  }

  async function salvarItem(item: CountItem, justificativa?: string) {
    if (!active) return;
    await fetch(`/api/estoque/contagens/${active.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: [{ itemId: item.id, quantidadeContada: item.quantidadeContada ?? undefined, justificativa }] }),
    });
    const res = await fetch(`/api/estoque/contagens/${active.id}`);
    const data = await res.json();
    setItems(data.count.items);
  }

  async function finalizar() {
    if (!active) return;
    const esperado = items.reduce((s, i) => s + i.estoqueEsperado * (i.ingredient.precoAtual / (i.ingredient.quantidadeEmbalagem || 1)), 0);
    const contado = items.reduce((s, i) => s + (i.quantidadeContada ?? i.estoqueEsperado) * (i.ingredient.precoAtual / (i.ingredient.quantidadeEmbalagem || 1)), 0);
    await fetch(`/api/estoque/contagens/${active.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "CONCLUIDA" }),
    });
    setSummary({ esperado, contado });
    refreshList();
  }

  const pendentes = items.filter((i) => i.quantidadeContada === null).length;
  const divergentesSemJustificativa = items.filter((i) => i.status === "DIVERGENCIA" && !i.justificativa).length;

  return (
    <div className="space-y-6">
      <Section
        title="Contagens semanais"
        action={<Toolbar onRefresh={refreshList} onAdd={canCreate ? () => { setError(null); setShowNew(true); } : undefined} addLabel="Iniciar contagem" />}
      >
        <div className="overflow-x-auto nord-scrollbar">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-nord-gray border-b border-nord-border">
                <th className="py-2 pr-4">Data</th>
                <th className="py-2 pr-4">Setor</th>
                <th className="py-2 pr-4">Responsável</th>
                <th className="py-2 pr-4">Progresso</th>
                <th className="py-2 pr-4">Divergências</th>
                <th className="py-2 pr-4">Status</th>
                <th className="py-2 pr-4" />
              </tr>
            </thead>
            <tbody>
              {counts.map((c) => (
                <tr key={c.id} className="border-b border-nord-border/50 hover:bg-white/5">
                  <td className="py-2.5 pr-4 text-nord-gray">{format(new Date(c.dataContagem), "dd/MM/yyyy")}</td>
                  <td className="py-2.5 pr-4 text-white">{c.setor ?? "—"}</td>
                  <td className="py-2.5 pr-4 text-nord-gray">{c.responsavel ?? "—"}</td>
                  <td className="py-2.5 pr-4 w-40">
                    <div className="flex items-center gap-2">
                      <ProgressBar percent={c.totalItens ? (c.conferidos / c.totalItens) * 100 : 0} />
                      <span className="text-xs text-nord-gray whitespace-nowrap">{c.conferidos}/{c.totalItens}</span>
                    </div>
                  </td>
                  <td className="py-2.5 pr-4">
                    <Badge tone={c.divergencias ? "danger" : "default"}>{c.divergencias}</Badge>
                  </td>
                  <td className="py-2.5 pr-4">
                    <Badge tone={COUNT_STATUS_TONE[c.status]}>{COUNT_STATUS_LABEL[c.status] ?? c.status}</Badge>
                  </td>
                  <td className="py-2.5 pr-4 text-right">
                    <button onClick={() => abrirContagem(c)} className="text-xs text-nord-blue-light hover:underline">
                      Abrir
                    </button>
                  </td>
                </tr>
              ))}
              {counts.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-6 text-center text-nord-gray">
                    Nenhuma contagem semanal registrada ainda.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Section>

      <Modal open={showNew} onClose={() => setShowNew(false)} title="Iniciar contagem semanal" widthClass="max-w-sm">
        <div className="space-y-3">
          <label className="block">
            <span className="block text-xs text-nord-gray mb-1">Setor</span>
            <select className="input" value={setor} onChange={(e) => setSetor(e.target.value)}>
              {SECTORS.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="block text-xs text-nord-gray mb-1">Responsável</span>
            <input className="input" value={responsavel} onChange={(e) => setResponsavel(e.target.value)} />
          </label>
          {error && <p className="text-xs text-red-400">{error}</p>}
          <button onClick={iniciarContagem} className="btn-primary w-full py-2.5">
            Iniciar
          </button>
        </div>
      </Modal>

      <Modal open={!!active} onClose={() => setActive(null)} title={`Contagem — ${active?.setor ?? ""}`} widthClass="max-w-4xl">
        {active && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs text-nord-gray">
              <div>Responsável: <span className="text-white">{active.responsavel ?? "—"}</span></div>
              <div>Início: <span className="text-white">{active.horaInicio ?? "—"}</span></div>
              <div>Conferidos: <span className="text-white">{items.filter((i) => i.quantidadeContada !== null).length}/{items.length}</span></div>
              <div>Pendentes: <span className="text-white">{pendentes}</span></div>
            </div>

            {loadingDetail ? (
              <p className="text-sm text-nord-gray text-center py-6">Carregando...</p>
            ) : (
              <div className="overflow-x-auto nord-scrollbar max-h-[50vh]">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-nord-gray border-b border-nord-border sticky top-0 bg-nord-card">
                      <th className="py-2 pr-4">Produto</th>
                      <th className="py-2 pr-4">Esperado</th>
                      <th className="py-2 pr-4">Contado</th>
                      <th className="py-2 pr-4">Diferença</th>
                      <th className="py-2 pr-4">Status</th>
                      <th className="py-2 pr-4">Justificativa</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((it) => (
                      <tr key={it.id} className="border-b border-nord-border/50">
                        <td className="py-2 pr-4 text-white">{it.ingredient.name}</td>
                        <td className="py-2 pr-4 text-nord-gray">{formatNumber(it.estoqueEsperado, 1)} {it.ingredient.unidade}</td>
                        <td className="py-2 pr-4">
                          <input
                            className="input w-24"
                            type="number"
                            value={it.quantidadeContada ?? ""}
                            onChange={(e) => updateLocal(it.id, e.target.value)}
                            onBlur={() => salvarItem(it)}
                            disabled={active.status === "CONCLUIDA" || active.status === "APROVADA"}
                          />
                        </td>
                        <td className="py-2 pr-4 text-nord-gray">
                          {it.diferencaPercent !== null ? `${it.diferencaPercent >= 0 ? "+" : ""}${it.diferencaPercent.toFixed(1)}%` : "—"}
                        </td>
                        <td className="py-2 pr-4">
                          <Badge tone={COUNT_ITEM_STATUS_TONE[it.status]}>{COUNT_ITEM_STATUS_LABEL[it.status] ?? it.status}</Badge>
                        </td>
                        <td className="py-2 pr-4">
                          {it.status === "DIVERGENCIA" ? (
                            <input
                              className="input w-40"
                              placeholder="Justificar divergência"
                              defaultValue={it.justificativa ?? ""}
                              onBlur={(e) => salvarItem(it, e.target.value)}
                              disabled={active.status === "CONCLUIDA" || active.status === "APROVADA"}
                            />
                          ) : (
                            <span className="text-nord-gray">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {summary && (
              <div className="nord-card p-4 space-y-1.5 text-sm">
                <div className="flex justify-between"><span className="text-nord-gray">Valor esperado</span><span className="text-white">{formatCurrency(summary.esperado)}</span></div>
                <div className="flex justify-between"><span className="text-nord-gray">Valor contado</span><span className="text-white">{formatCurrency(summary.contado)}</span></div>
                <div className="flex justify-between font-medium"><span className="text-white">Diferença total</span><span className={summary.contado - summary.esperado < 0 ? "text-red-400" : "text-emerald-400"}>{formatCurrency(summary.contado - summary.esperado)}</span></div>
              </div>
            )}

            {active.status !== "CONCLUIDA" && active.status !== "APROVADA" && (
              <button
                onClick={finalizar}
                disabled={pendentes > 0 || divergentesSemJustificativa > 0}
                className="btn-primary w-full py-2.5"
                title={pendentes > 0 ? "Existem itens pendentes de contagem" : divergentesSemJustificativa > 0 ? "Justifique as divergências antes de finalizar" : undefined}
              >
                Finalizar contagem
              </button>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
