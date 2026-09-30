"use client";

import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Section, Badge } from "@/components/ui/stat-card";
import { Modal } from "@/components/ui/modal";
import { Toolbar } from "@/components/ui/toolbar";
import { formatNumber } from "@/lib/calc";
import { format } from "date-fns";
import {
  isAbsoluteMovement,
  STOCK_MOVEMENT_LABEL,
  STOCK_MOVEMENT_TONE,
  STOCK_MOVEMENT_TYPES,
  TRANSFER_STATUS_LABEL,
  TRANSFER_STATUS_TONE,
} from "@/lib/estoque";

type MovementDTO = {
  id: string;
  ingredientId: string;
  ingredientName: string;
  unidade: string;
  type: string;
  quantidade: number;
  estoqueApos: number;
  motivo: string | null;
  createdByName: string;
  createdAt: string;
};

type IngredientOption = { id: string; name: string; unidade: string; estoqueAtual: number };
type EmpresaOption = { id: string; name: string };

type TransferItemDTO = { id: string; ingredientName: string; unidade: string; quantidadeEnviada: number; quantidadeRecebida: number | null };
type TransferDTO = {
  id: string;
  status: string;
  origemNome: string;
  destinoNome: string;
  origemEmpresaId: string;
  destinoEmpresaId: string;
  responsavelEnvio: string | null;
  responsavelRecebimento: string | null;
  dataEnvio: string | null;
  dataRecebimento: string | null;
  observacao: string | null;
  createdAt: string;
  items: TransferItemDTO[];
};

type NewTransferItem = { ingredientId: string; quantidade: string };

const emptyForm = { ingredientId: "", type: "ENTRADA", quantidade: "", motivo: "" };
const emptyTransferItens: NewTransferItem[] = [{ ingredientId: "", quantidade: "" }];

export function MovimentacoesClient({
  initialMovements,
  ingredients,
  canCreate,
  isGrupoNordMode,
  initialTransfers,
  empresas,
  currentEmpresaId,
}: {
  initialMovements: MovementDTO[];
  ingredients: IngredientOption[];
  canCreate: boolean;
  /** Diferencia por que `canCreate` é falso: modo Grupo Nord (consolidado) ou permissão do perfil numa loja específica. */
  isGrupoNordMode: boolean;
  initialTransfers: TransferDTO[];
  empresas: EmpresaOption[];
  currentEmpresaId: string;
}) {
  const [movements, setMovements] = useState(initialMovements);
  const [transfers, setTransfers] = useState(initialTransfers);
  const [ingredientFilter, setIngredientFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Campos usados só quando form.type === "TRANSFERENCIA" (substitui Insumo/Quantidade/Motivo
  // pelo formulário de transferência entre lojas, que cria um `Transfer`/`TransferItem` em vez de
  // um `StockMovement` avulso — reaproveitado da extinta tela /portal/estoque/transferencias).
  const [destinoEmpresaId, setDestinoEmpresaId] = useState("");
  const [responsavelEnvio, setResponsavelEnvio] = useState("");
  const [observacaoTransfer, setObservacaoTransfer] = useState("");
  const [itensTransfer, setItensTransfer] = useState<NewTransferItem[]>(emptyTransferItens);

  const [recebendo, setRecebendo] = useState<TransferDTO | null>(null);
  const [responsavelRecebimento, setResponsavelRecebimento] = useState("");
  const [quantidadesRecebidas, setQuantidadesRecebidas] = useState<Record<string, string>>({});
  const [enviando, setEnviando] = useState(false);
  const [recebendoSubmitting, setRecebendoSubmitting] = useState(false);

  const filtered = useMemo(
    () =>
      movements.filter((m) => {
        if (ingredientFilter && m.ingredientId !== ingredientFilter) return false;
        if (typeFilter && m.type !== typeFilter) return false;
        return true;
      }),
    [movements, ingredientFilter, typeFilter]
  );

  async function refresh() {
    const res = await fetch("/api/estoque/movimentos");
    const data = await res.json();
    setMovements(
      data.movements.map((m: { id: string; ingredientId: string; ingredient: { name: string; unidade: string }; type: string; quantidade: number; estoqueApos: number; motivo: string | null; createdBy: { name: string }; createdAt: string }) => ({
        id: m.id,
        ingredientId: m.ingredientId,
        ingredientName: m.ingredient.name,
        unidade: m.ingredient.unidade,
        type: m.type,
        quantidade: m.quantidade,
        estoqueApos: m.estoqueApos,
        motivo: m.motivo,
        createdByName: m.createdBy.name,
        createdAt: m.createdAt,
      }))
    );
  }

  async function refreshTransfers() {
    const res = await fetch("/api/estoque/transferencias");
    const data = await res.json();
    setTransfers(
      data.transfers.map((t: Record<string, unknown>) => ({
        id: t.id,
        status: t.status,
        origemNome: (t.origemEmpresa as { name: string }).name,
        destinoNome: (t.destinoEmpresa as { name: string }).name,
        origemEmpresaId: t.origemEmpresaId,
        destinoEmpresaId: t.destinoEmpresaId,
        responsavelEnvio: t.responsavelEnvio,
        responsavelRecebimento: t.responsavelRecebimento,
        dataEnvio: t.dataEnvio,
        dataRecebimento: t.dataRecebimento,
        observacao: t.observacao,
        createdAt: t.createdAt,
        items: (t.items as Record<string, unknown>[]).map((it) => ({
          id: it.id,
          ingredientName: (it.ingredient as { name: string }).name,
          unidade: it.unidade,
          quantidadeEnviada: it.quantidadeEnviada,
          quantidadeRecebida: it.quantidadeRecebida,
        })),
      }))
    );
  }

  function addItemTransfer() {
    setItensTransfer([...itensTransfer, { ingredientId: "", quantidade: "" }]);
  }
  function updateItemTransfer(idx: number, patch: Partial<NewTransferItem>) {
    setItensTransfer(itensTransfer.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  }
  function removeItemTransfer(idx: number) {
    setItensTransfer(itensTransfer.filter((_, i) => i !== idx));
  }

  async function submit() {
    if (submitting) return;
    setError(null);

    if (form.type === "TRANSFERENCIA") {
      const validItens = itensTransfer
        .filter((it) => it.ingredientId && it.quantidade)
        .map((it) => ({ ingredientId: it.ingredientId, quantidade: it.quantidade, unidade: ingredients.find((i) => i.id === it.ingredientId)?.unidade ?? "" }));
      if (!destinoEmpresaId || validItens.length === 0) {
        setError("Selecione a loja de destino e ao menos um item.");
        return;
      }
      setSubmitting(true);
      try {
        const res = await fetch("/api/estoque/transferencias", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ destinoEmpresaId, responsavelEnvio, observacao: observacaoTransfer, itens: validItens }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setError(data.error ?? "Não foi possível solicitar a transferência.");
          return;
        }
        setShowForm(false);
        setForm(emptyForm);
        setDestinoEmpresaId("");
        setItensTransfer(emptyTransferItens);
        refreshTransfers();
      } finally {
        setSubmitting(false);
      }
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/estoque/movimentos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Não foi possível registrar a movimentação.");
        return;
      }
      setShowForm(false);
      setForm(emptyForm);
      refresh();
    } finally {
      setSubmitting(false);
    }
  }

  async function marcarEnviada(t: TransferDTO) {
    if (enviando) return;
    setEnviando(true);
    try {
      await fetch(`/api/estoque/transferencias/${t.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "ENVIADA", responsavelEnvio: t.responsavelEnvio }),
      });
      // Marcar como enviada gera um StockMovement (saída) na loja de origem, além de avançar o
      // status da transferência — por isso atualiza as duas listas desta tela.
      await Promise.all([refresh(), refreshTransfers()]);
    } finally {
      setEnviando(false);
    }
  }

  function openRecebimento(t: TransferDTO) {
    setRecebendo(t);
    setResponsavelRecebimento("");
    const initial: Record<string, string> = {};
    for (const it of t.items) initial[it.id] = String(it.quantidadeEnviada);
    setQuantidadesRecebidas(initial);
  }

  async function confirmarRecebimento() {
    if (!recebendo || recebendoSubmitting) return;
    setRecebendoSubmitting(true);
    try {
      await fetch(`/api/estoque/transferencias/${recebendo.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "RECEBIDA",
          responsavelRecebimento,
          quantidadesRecebidas: recebendo.items.map((it) => ({ itemId: it.id, quantidade: Number(quantidadesRecebidas[it.id] ?? it.quantidadeEnviada) })),
        }),
      });
      setRecebendo(null);
      refreshTransfers();
    } finally {
      setRecebendoSubmitting(false);
    }
  }

  const isTransferForm = form.type === "TRANSFERENCIA";

  return (
    <div className="space-y-6">
      <Section
        title="Histórico de movimentações"
        action={
          canCreate ? (
            <button
              onClick={() => setShowForm(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-nord-blue hover:bg-nord-blue-light text-white font-medium"
            >
              <Plus size={13} /> Registrar movimentação
            </button>
          ) : undefined
        }
      >
        {!canCreate && (
          <p className="mb-4 text-xs text-nord-warning bg-nord-warning/10 border border-nord-warning/30 rounded-lg px-3 py-2">
            {isGrupoNordMode
              ? "Você está no modo Grupo Nord (consolidado). Selecione uma loja específica no menu lateral para registrar movimentações ou transferências."
              : "Seu perfil de permissão não permite registrar movimentações neste módulo."}
          </p>
        )}

        <div className="flex items-center gap-2 flex-wrap mb-4">
          <select value={ingredientFilter} onChange={(e) => setIngredientFilter(e.target.value)} className="input w-56">
            <option value="">Todos os insumos</option>
            {ingredients.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
          </select>
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="input w-44">
            <option value="">Todos os tipos</option>
            {STOCK_MOVEMENT_TYPES.map((t) => (
              <option key={t} value={t}>
                {STOCK_MOVEMENT_LABEL[t]}
              </option>
            ))}
          </select>
        </div>

        <div className="overflow-x-auto nord-scrollbar">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-nord-gray border-b border-nord-border">
                <th className="py-2 pr-4">Data</th>
                <th className="py-2 pr-4">Insumo</th>
                <th className="py-2 pr-4">Tipo</th>
                <th className="py-2 pr-4">Quantidade</th>
                <th className="py-2 pr-4">Estoque após</th>
                <th className="py-2 pr-4">Motivo</th>
                <th className="py-2 pr-4">Responsável</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((m) => (
                <tr key={m.id} className="border-b border-nord-border/50 hover:bg-white/5">
                  <td className="py-2.5 pr-4 text-nord-gray">{format(new Date(m.createdAt), "dd/MM/yyyy HH:mm")}</td>
                  <td className="py-2.5 pr-4 text-white">{m.ingredientName}</td>
                  <td className="py-2.5 pr-4">
                    <Badge tone={STOCK_MOVEMENT_TONE[m.type as keyof typeof STOCK_MOVEMENT_TONE]}>{STOCK_MOVEMENT_LABEL[m.type as keyof typeof STOCK_MOVEMENT_LABEL]}</Badge>
                  </td>
                  <td className="py-2.5 pr-4 text-nord-gray">
                    {formatNumber(m.quantidade)} {m.unidade}
                  </td>
                  <td className="py-2.5 pr-4 text-nord-gray">
                    {formatNumber(m.estoqueApos)} {m.unidade}
                  </td>
                  <td className="py-2.5 pr-4 text-nord-gray">{m.motivo ?? "-"}</td>
                  <td className="py-2.5 pr-4 text-nord-gray">{m.createdByName}</td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-6 text-center text-nord-gray">
                    Nenhuma movimentação encontrada.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="Transferências entre lojas" action={<Toolbar onRefresh={refreshTransfers} />}>
        <div className="overflow-x-auto nord-scrollbar">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-nord-gray border-b border-nord-border">
                <th className="py-2 pr-4">Data</th>
                <th className="py-2 pr-4">Origem</th>
                <th className="py-2 pr-4">Destino</th>
                <th className="py-2 pr-4">Itens</th>
                <th className="py-2 pr-4">Status</th>
                <th className="py-2 pr-4" />
              </tr>
            </thead>
            <tbody>
              {transfers.map((t) => {
                const divergente = t.items.some((it) => it.quantidadeRecebida !== null && it.quantidadeRecebida !== it.quantidadeEnviada);
                const isOrigem = currentEmpresaId !== "" && t.origemEmpresaId === currentEmpresaId;
                const isDestino = currentEmpresaId !== "" && t.destinoEmpresaId === currentEmpresaId;
                return (
                  <tr key={t.id} className="border-b border-nord-border/50 hover:bg-white/5">
                    <td className="py-2.5 pr-4 text-nord-gray">{format(new Date(t.createdAt), "dd/MM/yyyy")}</td>
                    <td className="py-2.5 pr-4"><span className="text-white">{t.origemNome}</span></td>
                    <td className="py-2.5 pr-4"><span className="text-white">{t.destinoNome}</span></td>
                    <td className="py-2.5 pr-4 text-nord-gray">{t.items.length}</td>
                    <td className="py-2.5 pr-4">
                      <Badge tone={divergente ? "danger" : TRANSFER_STATUS_TONE[t.status]}>
                        {divergente ? "Divergência" : TRANSFER_STATUS_LABEL[t.status] ?? t.status}
                      </Badge>
                    </td>
                    <td className="py-2.5 pr-4 text-right space-x-2 whitespace-nowrap">
                      {canCreate && isOrigem && t.status === "SOLICITADA" && (
                        <button onClick={() => marcarEnviada(t)} disabled={enviando} className="text-xs text-nord-blue-light hover:underline disabled:opacity-50">
                          {enviando ? "Marcando..." : "Marcar enviada"}
                        </button>
                      )}
                      {canCreate && isDestino && t.status === "ENVIADA" && (
                        <button onClick={() => openRecebimento(t)} className="text-xs text-nord-success hover:underline">
                          Conferir recebimento
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {transfers.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-nord-gray">
                    Nenhuma transferência registrada.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Section>

      <Modal
        open={showForm}
        onClose={() => setShowForm(false)}
        title={isTransferForm ? "Transferência para outra loja" : "Registrar movimentação"}
        widthClass={isTransferForm ? "max-w-xl" : "max-w-sm"}
      >
        <div className="space-y-3">
          <label className="block">
            <span className="block text-xs text-nord-gray mb-1">Tipo de movimentação</span>
            <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className="input">
              {STOCK_MOVEMENT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {STOCK_MOVEMENT_LABEL[t]}
                </option>
              ))}
            </select>
          </label>

          {isTransferForm ? (
            <>
              <label className="block">
                <span className="block text-xs text-nord-gray mb-1">Loja de destino</span>
                <select className="input" value={destinoEmpresaId} onChange={(e) => setDestinoEmpresaId(e.target.value)}>
                  <option value="">Selecione...</option>
                  {empresas.filter((e) => e.id !== currentEmpresaId).map((e) => (
                    <option key={e.id} value={e.id}>{e.name}</option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="block text-xs text-nord-gray mb-1">Responsável pelo envio</span>
                <input className="input" value={responsavelEnvio} onChange={(e) => setResponsavelEnvio(e.target.value)} />
              </label>
              <div className="space-y-2">
                <span className="block text-xs text-nord-gray">Itens</span>
                {itensTransfer.map((it, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <select className="input flex-1" value={it.ingredientId} onChange={(e) => updateItemTransfer(idx, { ingredientId: e.target.value })}>
                      <option value="">Insumo...</option>
                      {ingredients.map((i) => (
                        <option key={i.id} value={i.id}>{i.name}</option>
                      ))}
                    </select>
                    <input className="input w-28" type="number" placeholder="Qtd." value={it.quantidade} onChange={(e) => updateItemTransfer(idx, { quantidade: e.target.value })} />
                    <button onClick={() => removeItemTransfer(idx)} className="text-nord-gray hover:text-nord-danger">
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
                <button onClick={addItemTransfer} className="btn-outline">
                  <Plus size={13} /> Adicionar item
                </button>
              </div>
              <label className="block">
                <span className="block text-xs text-nord-gray mb-1">Observação</span>
                <input className="input" value={observacaoTransfer} onChange={(e) => setObservacaoTransfer(e.target.value)} />
              </label>
              {error && <p className="text-xs text-nord-danger">{error}</p>}
              <button
                onClick={submit}
                disabled={!destinoEmpresaId || !itensTransfer.some((it) => it.ingredientId && it.quantidade) || submitting}
                className="w-full bg-nord-blue hover:bg-nord-blue-light disabled:opacity-50 text-white text-sm font-medium rounded-lg py-2.5"
              >
                {submitting ? "Solicitando..." : "Solicitar transferência"}
              </button>
            </>
          ) : (
            <>
              <label className="block">
                <span className="block text-xs text-nord-gray mb-1">Insumo</span>
                <select value={form.ingredientId} onChange={(e) => setForm({ ...form, ingredientId: e.target.value })} className="input">
                  <option value="">Selecione...</option>
                  {ingredients.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.name} (estoque atual: {formatNumber(i.estoqueAtual)} {i.unidade})
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="block text-xs text-nord-gray mb-1">
                  {isAbsoluteMovement(form.type) ? "Quantidade contada (valor final do estoque)" : "Quantidade"}
                </span>
                <input type="number" value={form.quantidade} onChange={(e) => setForm({ ...form, quantidade: e.target.value })} className="input" />
              </label>
              <label className="block">
                <span className="block text-xs text-nord-gray mb-1">Motivo / observação (opcional)</span>
                <input value={form.motivo} onChange={(e) => setForm({ ...form, motivo: e.target.value })} className="input" />
              </label>
              {error && <p className="text-xs text-nord-danger">{error}</p>}
              <button
                onClick={submit}
                disabled={!form.ingredientId || !form.quantidade || submitting}
                className="w-full bg-nord-blue hover:bg-nord-blue-light disabled:opacity-50 text-white text-sm font-medium rounded-lg py-2.5"
              >
                {submitting ? "Registrando..." : "Registrar"}
              </button>
            </>
          )}
        </div>
      </Modal>

      <Modal open={!!recebendo} onClose={() => setRecebendo(null)} title="Conferir recebimento" widthClass="max-w-lg">
        {recebendo && (
          <div className="space-y-3">
            <label className="block">
              <span className="block text-xs text-nord-gray mb-1">Responsável pelo recebimento</span>
              <input className="input" value={responsavelRecebimento} onChange={(e) => setResponsavelRecebimento(e.target.value)} />
            </label>
            <div className="space-y-2">
              {recebendo.items.map((it) => (
                <div key={it.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="text-white flex-1">{it.ingredientName}</span>
                  <span className="text-nord-gray text-xs">Enviado: {formatNumber(it.quantidadeEnviada)} {it.unidade}</span>
                  <input
                    className="input w-24"
                    type="number"
                    value={quantidadesRecebidas[it.id] ?? ""}
                    onChange={(e) => setQuantidadesRecebidas({ ...quantidadesRecebidas, [it.id]: e.target.value })}
                  />
                </div>
              ))}
            </div>
            <button onClick={confirmarRecebimento} disabled={recebendoSubmitting} className="w-full bg-nord-blue hover:bg-nord-blue-light disabled:opacity-50 text-white text-sm font-medium rounded-lg py-2.5">
              {recebendoSubmitting ? "Confirmando..." : "Confirmar recebimento"}
            </button>
          </div>
        )}
      </Modal>
    </div>
  );
}
