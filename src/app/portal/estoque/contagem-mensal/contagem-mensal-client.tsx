"use client";

import { useState } from "react";
import { Section, Badge, ProgressBar } from "@/components/ui/stat-card";
import { Modal } from "@/components/ui/modal";
import { Toolbar } from "@/components/ui/toolbar";
import { formatCurrency, formatNumber } from "@/lib/calc";
import { COUNT_ITEM_STATUS_LABEL, COUNT_ITEM_STATUS_TONE, COUNT_STATUS_LABEL, COUNT_STATUS_TONE, MONTHLY_COUNT_CHECKLIST } from "@/lib/estoque";

type CountRow = {
  id: string;
  mes: number | null;
  ano: number;
  dataContagem: string;
  responsavel: string | null;
  status: string;
  checklistJson: string | null;
  aprovadoPor: string | null;
  aprovadoEm: string | null;
  totalItens: number;
  conferidos: number;
  divergencias: number;
  createdByName: string;
};

type CountItem = {
  id: string;
  ingredientId: string;
  estoqueEsperado: number;
  quantidadeContada: number | null;
  diferencaPercent: number | null;
  status: string;
  justificativa: string | null;
  ingredient: { name: string; unidade: string; precoAtual: number; quantidadeEmbalagem: number };
};

const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const APPROVER_ROLES = ["ADMINISTRADOR", "GESTOR", "GERENTE"];

export function ContagemMensalClient({ initialCounts, canCreate, userRole }: { initialCounts: CountRow[]; canCreate: boolean; userRole: string }) {
  const [counts, setCounts] = useState(initialCounts);
  const [responsavel, setResponsavel] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [active, setActive] = useState<CountRow | null>(null);
  const [items, setItems] = useState<CountItem[]>([]);
  const [checklist, setChecklist] = useState<Record<string, boolean>>({});
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [motivoReabertura, setMotivoReabertura] = useState("");
  const [showReabrir, setShowReabrir] = useState(false);

  async function refreshList() {
    const res = await fetch("/api/estoque/contagens?type=MENSAL");
    const data = await res.json();
    setCounts(
      data.counts.map((c: Record<string, unknown>) => ({
        id: c.id,
        mes: c.mes,
        ano: c.ano,
        dataContagem: c.dataContagem,
        responsavel: c.responsavel,
        status: c.status,
        checklistJson: c.checklistJson,
        aprovadoPor: c.aprovadoPor,
        aprovadoEm: c.aprovadoEm,
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
      body: JSON.stringify({ type: "MENSAL", responsavel }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.error ?? "Não foi possível iniciar o fechamento mensal.");
      return;
    }
    setShowNew(false);
    await refreshList();
  }

  async function abrirContagem(c: CountRow) {
    setActive(c);
    setLoadingDetail(true);
    setChecklist(c.checklistJson ? JSON.parse(c.checklistJson) : {});
    const res = await fetch(`/api/estoque/contagens/${c.id}`);
    const data = await res.json();
    setItems(data.count.items);
    setLoadingDetail(false);
  }

  function updateLocal(itemId: string, quantidade: string) {
    setItems((prev) => prev.map((it) => (it.id === itemId ? { ...it, quantidadeContada: quantidade === "" ? null : Number(quantidade) } : it)));
  }

  async function salvarItem(item: CountItem, justificativa?: string) {
    if (!active) return;
    await fetch(`/api/estoque/contagens/${active.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: [{ itemId: item.id, quantidadeContada: item.quantidadeContada ?? undefined, justificativa }] }),
    });
  }

  async function salvarChecklist(next: Record<string, boolean>) {
    if (!active) return;
    setChecklist(next);
    await fetch(`/api/estoque/contagens/${active.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ checklistJson: next }),
    });
  }

  const pendentes = items.filter((i) => i.quantidadeContada === null).length;
  const divergentesSemJustificativa = items.filter((i) => i.status === "DIVERGENCIA" && !i.justificativa).length;
  const checklistCompleto = MONTHLY_COUNT_CHECKLIST.every((c) => checklist[c.key]);
  const valorEsperado = items.reduce((s, i) => s + i.estoqueEsperado * (i.ingredient.precoAtual / (i.ingredient.quantidadeEmbalagem || 1)), 0);
  const valorContado = items.reduce((s, i) => s + (i.quantidadeContada ?? i.estoqueEsperado) * (i.ingredient.precoAtual / (i.ingredient.quantidadeEmbalagem || 1)), 0);

  async function aprovarFechamento() {
    if (!active) return;
    const res = await fetch(`/api/estoque/contagens/${active.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "APROVADA" }),
    });
    if (res.ok) {
      setActive(null);
      refreshList();
    }
  }

  async function reabrir() {
    if (!active || !motivoReabertura) return;
    const res = await fetch(`/api/estoque/contagens/${active.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "REABERTA", motivoReabertura }),
    });
    if (res.ok) {
      setShowReabrir(false);
      setMotivoReabertura("");
      setActive(null);
      refreshList();
    }
  }

  const podeAprovar = APPROVER_ROLES.includes(userRole);
  const podeReabrir = userRole === "ADMINISTRADOR";

  return (
    <div className="space-y-6">
      <Section
        title="Fechamentos mensais (CMV Real)"
        action={<Toolbar onRefresh={refreshList} onAdd={canCreate ? () => { setError(null); setShowNew(true); } : undefined} addLabel="Iniciar fechamento" />}
      >
        <div className="overflow-x-auto nord-scrollbar">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-nord-gray border-b border-nord-border">
                <th className="py-2 pr-4">Mês/Ano</th>
                <th className="py-2 pr-4">Responsável</th>
                <th className="py-2 pr-4">Progresso</th>
                <th className="py-2 pr-4">Status</th>
                <th className="py-2 pr-4">Aprovado por</th>
                <th className="py-2 pr-4" />
              </tr>
            </thead>
            <tbody>
              {counts.map((c) => (
                <tr key={c.id} className="border-b border-nord-border/50 hover:bg-white/5">
                  <td className="py-2.5 pr-4 text-white">{c.mes ? MESES[c.mes - 1] : "—"}/{c.ano}</td>
                  <td className="py-2.5 pr-4 text-nord-gray">{c.responsavel ?? "—"}</td>
                  <td className="py-2.5 pr-4 w-40">
                    <div className="flex items-center gap-2">
                      <ProgressBar percent={c.totalItens ? (c.conferidos / c.totalItens) * 100 : 0} />
                      <span className="text-xs text-nord-gray whitespace-nowrap">{c.conferidos}/{c.totalItens}</span>
                    </div>
                  </td>
                  <td className="py-2.5 pr-4">
                    <Badge tone={COUNT_STATUS_TONE[c.status]}>{COUNT_STATUS_LABEL[c.status] ?? c.status}</Badge>
                  </td>
                  <td className="py-2.5 pr-4 text-nord-gray">{c.aprovadoPor ?? "—"}</td>
                  <td className="py-2.5 pr-4 text-right">
                    <button onClick={() => abrirContagem(c)} className="text-xs text-nord-blue-light hover:underline">
                      Abrir
                    </button>
                  </td>
                </tr>
              ))}
              {counts.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-nord-gray">
                    Nenhum fechamento mensal registrado ainda.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Section>

      <Modal open={showNew} onClose={() => setShowNew(false)} title="Iniciar fechamento mensal" widthClass="max-w-sm">
        <div className="space-y-3">
          <p className="text-xs text-nord-gray">A contagem mensal considera todos os produtos ativos da loja e será usada no cálculo oficial do CMV Real.</p>
          <label className="block">
            <span className="block text-xs text-nord-gray mb-1">Responsável pelo fechamento</span>
            <input className="input" value={responsavel} onChange={(e) => setResponsavel(e.target.value)} />
          </label>
          {error && <p className="text-xs text-red-400">{error}</p>}
          <button onClick={iniciarContagem} className="btn-primary w-full py-2.5">
            Iniciar
          </button>
        </div>
      </Modal>

      <Modal open={!!active} onClose={() => setActive(null)} title={`Fechamento mensal — ${active?.mes ? MESES[active.mes - 1] : ""}/${active?.ano ?? ""}`} widthClass="max-w-4xl">
        {active && (
          <div className="space-y-4">
            <div>
              <span className="block text-xs text-nord-gray mb-2">Checklist antes da finalização</span>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
                {MONTHLY_COUNT_CHECKLIST.map((c) => (
                  <label key={c.key} className="flex items-center gap-2 text-sm text-white">
                    <input
                      type="checkbox"
                      checked={!!checklist[c.key]}
                      disabled={active.status === "APROVADA"}
                      onChange={(e) => salvarChecklist({ ...checklist, [c.key]: e.target.checked })}
                    />
                    {c.label}
                  </label>
                ))}
              </div>
            </div>

            {loadingDetail ? (
              <p className="text-sm text-nord-gray text-center py-6">Carregando...</p>
            ) : (
              <div className="overflow-x-auto nord-scrollbar max-h-[40vh]">
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
                            defaultValue={it.quantidadeContada ?? ""}
                            onChange={(e) => updateLocal(it.id, e.target.value)}
                            onBlur={() => salvarItem(it)}
                            disabled={active.status === "APROVADA"}
                          />
                        </td>
                        <td className="py-2 pr-4 text-nord-gray">{it.diferencaPercent !== null ? `${it.diferencaPercent >= 0 ? "+" : ""}${it.diferencaPercent.toFixed(1)}%` : "—"}</td>
                        <td className="py-2 pr-4"><Badge tone={COUNT_ITEM_STATUS_TONE[it.status]}>{COUNT_ITEM_STATUS_LABEL[it.status] ?? it.status}</Badge></td>
                        <td className="py-2 pr-4">
                          {it.status === "DIVERGENCIA" ? (
                            <input className="input w-40" placeholder="Justificar" defaultValue={it.justificativa ?? ""} onBlur={(e) => salvarItem(it, e.target.value)} disabled={active.status === "APROVADA"} />
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

            <div className="nord-card p-4 space-y-1.5 text-sm">
              <div className="flex justify-between"><span className="text-nord-gray">Valor esperado do estoque</span><span className="text-white">{formatCurrency(valorEsperado)}</span></div>
              <div className="flex justify-between"><span className="text-nord-gray">Valor contado</span><span className="text-white">{formatCurrency(valorContado)}</span></div>
              <div className="flex justify-between font-medium"><span className="text-white">Diferença total</span><span className={valorContado - valorEsperado < 0 ? "text-red-400" : "text-emerald-400"}>{formatCurrency(valorContado - valorEsperado)}</span></div>
            </div>

            {active.status === "APROVADA" ? (
              <div className="flex items-center justify-between text-sm bg-emerald-950/20 border border-emerald-900/40 rounded-lg px-3 py-2">
                <span className="text-emerald-400">Fechamento aprovado por {active.aprovadoPor} — alterações bloqueadas.</span>
                {podeReabrir && (
                  <button onClick={() => setShowReabrir(true)} className="text-xs text-red-400 hover:underline">
                    Reabrir fechamento
                  </button>
                )}
              </div>
            ) : (
              podeAprovar && (
                <button
                  onClick={aprovarFechamento}
                  disabled={pendentes > 0 || divergentesSemJustificativa > 0 || !checklistCompleto}
                  className="btn-primary w-full py-2.5"
                  title={!checklistCompleto ? "Complete o checklist antes de aprovar" : pendentes > 0 ? "Existem itens pendentes de contagem" : divergentesSemJustificativa > 0 ? "Justifique as divergências antes de aprovar" : undefined}
                >
                  Aprovar fechamento e gerar CMV Real
                </button>
              )
            )}
          </div>
        )}
      </Modal>

      <Modal open={showReabrir} onClose={() => setShowReabrir(false)} title="Reabrir fechamento" widthClass="max-w-sm">
        <div className="space-y-3">
          <p className="text-xs text-amber-400">Reabrir um fechamento aprovado é uma ação sensível e será registrada. Informe o motivo.</p>
          <textarea className="input" rows={3} value={motivoReabertura} onChange={(e) => setMotivoReabertura(e.target.value)} />
          <button onClick={reabrir} disabled={!motivoReabertura.trim()} className="btn-primary w-full py-2.5">
            Confirmar reabertura
          </button>
        </div>
      </Modal>
    </div>
  );
}
