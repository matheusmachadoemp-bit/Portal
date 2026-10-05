"use client";

import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Section, Badge, ProgressBar } from "@/components/ui/stat-card";
import { Modal, ConfirmDialog } from "@/components/ui/modal";
import { Toolbar } from "@/components/ui/toolbar";
import { formatCurrency, formatNumber } from "@/lib/calc";
import { COUNT_ITEM_STATUS_LABEL, COUNT_ITEM_STATUS_TONE, COUNT_STATUS_LABEL, COUNT_STATUS_TONE, MONTHLY_COUNT_CHECKLIST, ingredientCostPerUnit } from "@/lib/estoque";
import { AgendaLembretesModal } from "../contagem/agenda-lembretes-modal";

type CountRow = {
  id: string;
  setor: string | null;
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
  createdByName: string;
};

type EmployeeOption = { id: string; name: string };

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

export function ContagemMensalClient({
  initialCounts,
  employees,
  setores,
  users,
  canCreate,
  canEdit,
  canDelete,
  canCreateAgenda,
  canManageAgenda,
  userRole,
}: {
  initialCounts: CountRow[];
  employees: EmployeeOption[];
  setores: string[];
  /** Usuários (`User`, não `Employee`) selecionáveis como responsável pelo lembrete de
   *  notificação — ver `AgendaLembretesModal`/`StockCountSchedule.responsavelId`. */
  users: { id: string; name: string }[];
  canCreate: boolean;
  /** Edita setor/responsável de um fechamento já criado (PATCH /api/estoque/contagens/[id]). */
  canEdit: boolean;
  /** Exclui um fechamento em rascunho/andamento/concluído (DELETE /api/estoque/contagens/[id] —
   *  a própria API bloqueia fechamentos aprovados/reabertos; a UI nem mostra o botão nesse caso). */
  canDelete: boolean;
  canCreateAgenda: boolean;
  canManageAgenda: boolean;
  userRole: string;
}) {
  const [counts, setCounts] = useState(initialCounts);
  const [setor, setSetor] = useState<string>("");
  const [responsavel, setResponsavel] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [active, setActive] = useState<CountRow | null>(null);
  const [items, setItems] = useState<CountItem[]>([]);
  const [checklist, setChecklist] = useState<Record<string, boolean>>({});
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [motivoReabertura, setMotivoReabertura] = useState("");
  const [showReabrir, setShowReabrir] = useState(false);

  const [editing, setEditing] = useState<CountRow | null>(null);
  const [editSetor, setEditSetor] = useState("");
  const [editResponsavel, setEditResponsavel] = useState("");
  const [editError, setEditError] = useState<string | null>(null);
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function refreshList() {
    const res = await fetch("/api/estoque/contagens?type=MENSAL");
    const data = await res.json();
    setCounts(
      data.counts.map((c: Record<string, unknown>) => ({
        id: c.id,
        setor: c.setor,
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
        // `createdBy` vem `null` quando a contagem foi gerada automaticamente por uma
        // `StockCountSchedule` (sem usuário logado que a criou) — ver generateStockCounts em
        // src/lib/estoque-server.ts.
        createdByName: (c.createdBy as { name: string } | null)?.name ?? "—",
      }))
    );
  }

  async function iniciarContagem() {
    setError(null);
    const res = await fetch("/api/estoque/contagens", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "MENSAL", setor: setor || undefined, responsavel }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.error ?? "Não foi possível iniciar o fechamento mensal.");
      return;
    }
    setShowNew(false);
    await refreshList();
  }

  function openEdit(c: CountRow) {
    setEditing(c);
    setEditSetor(c.setor ?? "");
    setEditResponsavel(c.responsavel ?? "");
    setEditError(null);
  }

  async function salvarEdicao() {
    if (!editing || editSubmitting) return;
    setEditSubmitting(true);
    setEditError(null);
    try {
      const res = await fetch(`/api/estoque/contagens/${editing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ setor: editSetor, responsavel: editResponsavel }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setEditError(data.error ?? "Não foi possível salvar as alterações.");
        return;
      }
      setEditing(null);
      await refreshList();
    } finally {
      setEditSubmitting(false);
    }
  }

  async function doDelete() {
    if (!confirmDeleteId) return;
    const res = await fetch(`/api/estoque/contagens/${confirmDeleteId}`, { method: "DELETE" });
    setConfirmDeleteId(null);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setDeleteError(data.error ?? "Não foi possível excluir o fechamento.");
      return;
    }
    setDeleteError(null);
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
  const checklistCompleto = MONTHLY_COUNT_CHECKLIST.every((c) => checklist[c.key]);
  const valorEsperado = items.reduce((s, i) => s + i.estoqueEsperado * ingredientCostPerUnit(i.ingredient), 0);
  const valorContado = items.reduce((s, i) => s + (i.quantidadeContada ?? i.estoqueEsperado) * ingredientCostPerUnit(i.ingredient), 0);

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
        action={
          <div className="flex items-center gap-2 flex-wrap">
            <AgendaLembretesModal
              type="MENSAL"
              typeLabel="Mensal"
              setores={setores}
              users={users}
              canCreate={canCreateAgenda}
              canManage={canManageAgenda}
            />
            <Toolbar onRefresh={refreshList} onAdd={canCreate ? () => { setError(null); setShowNew(true); } : undefined} addLabel="Iniciar fechamento" />
          </div>
        }
      >
        {deleteError && (
          <div className="mb-4 flex items-start gap-2 p-3 rounded-lg bg-nord-danger/10 border border-nord-danger/30">
            <AlertTriangle size={14} className="text-nord-danger mt-0.5 shrink-0" />
            <p className="text-xs text-nord-danger">{deleteError}</p>
          </div>
        )}
        <div className="overflow-x-auto nord-scrollbar">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-nord-gray border-b border-nord-border">
                <th className="py-2 pr-4">Mês/Ano</th>
                <th className="py-2 pr-4">Setor</th>
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
                  <td className="py-2.5 pr-4 text-white">{c.setor ?? "Todos"}</td>
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
                    {canEdit && (
                      <button onClick={() => openEdit(c)} className="text-xs text-nord-blue-light hover:underline ml-3">
                        Editar
                      </button>
                    )}
                    {canDelete && c.status !== "APROVADA" && c.status !== "REABERTA" && (
                      <button
                        onClick={() => { setDeleteError(null); setConfirmDeleteId(c.id); }}
                        className="text-xs text-nord-danger hover:underline ml-3"
                      >
                        Excluir
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {counts.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-6 text-center text-nord-gray">
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
          <p className="text-xs text-nord-gray">
            {setor
              ? "A contagem mensal considerará apenas os produtos ativos do setor escolhido e será usada no cálculo oficial do CMV Real."
              : "A contagem mensal considera todos os produtos ativos da loja e será usada no cálculo oficial do CMV Real."}
          </p>
          <label className="block">
            <span className="block text-xs text-nord-gray mb-1">Setor</span>
            <select className="input" value={setor} onChange={(e) => setSetor(e.target.value)}>
              <option value="">Todos os setores</option>
              {setores.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="block text-xs text-nord-gray mb-1">Responsável pelo fechamento</span>
            <select className="input" value={responsavel} onChange={(e) => setResponsavel(e.target.value)}>
              <option value="">Selecione...</option>
              {employees.map((emp) => (
                <option key={emp.id} value={emp.name}>{emp.name}</option>
              ))}
            </select>
          </label>
          {error && <p className="text-xs text-nord-danger">{error}</p>}
          <button onClick={iniciarContagem} className="btn-primary w-full py-2.5">
            Iniciar
          </button>
        </div>
      </Modal>

      <Modal
        open={!!active}
        onClose={() => setActive(null)}
        title={`Fechamento mensal — ${active?.mes ? MESES[active.mes - 1] : ""}/${active?.ano ?? ""}${active?.setor ? ` — ${active.setor}` : ""}`}
        widthClass="max-w-4xl"
      >
        {active && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs text-nord-gray">
              <div>Setor: <span className="text-white">{active.setor ?? "Todos os setores"}</span></div>
              <div>Responsável: <span className="text-white">{active.responsavel ?? "—"}</span></div>
              <div>Conferidos: <span className="text-white">{items.filter((i) => i.quantidadeContada !== null).length}/{items.length}</span></div>
              <div>Pendentes: <span className="text-white">{pendentes}</span></div>
            </div>

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
              <div className="flex justify-between font-medium"><span className="text-white">Diferença total</span><span className={valorContado - valorEsperado < 0 ? "text-nord-danger" : "text-nord-success"}>{formatCurrency(valorContado - valorEsperado)}</span></div>
            </div>

            {active.status === "APROVADA" ? (
              <div className="flex items-center justify-between text-sm bg-nord-success/10 border border-nord-success/30 rounded-lg px-3 py-2">
                <span className="text-nord-success">Fechamento aprovado por {active.aprovadoPor} — alterações bloqueadas.</span>
                {podeReabrir && (
                  <button onClick={() => setShowReabrir(true)} className="text-xs text-nord-danger hover:underline">
                    Reabrir fechamento
                  </button>
                )}
              </div>
            ) : (
              podeAprovar && (
                <button
                  onClick={aprovarFechamento}
                  disabled={pendentes > 0 || !checklistCompleto}
                  className="btn-primary w-full py-2.5"
                  title={!checklistCompleto ? "Complete o checklist antes de aprovar" : pendentes > 0 ? "Existem itens pendentes de contagem" : undefined}
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
          <p className="text-xs text-nord-warning">Reabrir um fechamento aprovado é uma ação sensível e será registrada. Informe o motivo.</p>
          <textarea className="input" rows={3} value={motivoReabertura} onChange={(e) => setMotivoReabertura(e.target.value)} />
          <button onClick={reabrir} disabled={!motivoReabertura.trim()} className="btn-primary w-full py-2.5">
            Confirmar reabertura
          </button>
        </div>
      </Modal>

      <Modal open={!!editing} onClose={() => setEditing(null)} title="Editar fechamento" widthClass="max-w-sm">
        {editing && (
          <div className="space-y-3">
            <label className="block">
              <span className="block text-xs text-nord-gray mb-1">Setor</span>
              <select className="input" value={editSetor} onChange={(e) => setEditSetor(e.target.value)}>
                <option value="">Todos os setores</option>
                {setores.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="block text-xs text-nord-gray mb-1">Responsável</span>
              <select className="input" value={editResponsavel} onChange={(e) => setEditResponsavel(e.target.value)}>
                <option value="">Selecione...</option>
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.name}>{emp.name}</option>
                ))}
              </select>
            </label>
            {editError && <p className="text-xs text-nord-danger">{editError}</p>}
            <button onClick={salvarEdicao} disabled={editSubmitting} className="btn-primary w-full py-2.5">
              {editSubmitting ? "Salvando..." : "Salvar"}
            </button>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={!!confirmDeleteId}
        title="Excluir fechamento"
        message="Tem certeza que deseja excluir este fechamento mensal? Essa ação não pode ser desfeita."
        onConfirm={doDelete}
        onCancel={() => setConfirmDeleteId(null)}
        confirmLabel="Excluir"
        danger
      />
    </div>
  );
}
