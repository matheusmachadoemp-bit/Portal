"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Section, Badge } from "@/components/ui/stat-card";
import { Modal } from "@/components/ui/modal";
import { Toolbar } from "@/components/ui/toolbar";
import { formatNumber } from "@/lib/calc";
import { format } from "date-fns";
import { TRANSFER_STATUS_LABEL, TRANSFER_STATUS_TONE } from "@/lib/estoque";

type TransferItem = { id: string; ingredientName: string; unidade: string; quantidadeEnviada: number; quantidadeRecebida: number | null };
type Transfer = {
  id: string;
  status: string;
  origemNome: string;
  origemCor: string;
  destinoNome: string;
  destinoCor: string;
  responsavelEnvio: string | null;
  responsavelRecebimento: string | null;
  dataEnvio: string | null;
  dataRecebimento: string | null;
  observacao: string | null;
  createdAt: string;
  items: TransferItem[];
};

type NewItem = { ingredientId: string; quantidade: string };

export function TransferenciasClient({
  initialTransfers,
  empresas,
  currentEmpresaId,
  ingredients,
  canCreate,
}: {
  initialTransfers: Transfer[];
  empresas: { id: string; name: string }[];
  currentEmpresaId: string;
  ingredients: { id: string; name: string; unidade: string }[];
  canCreate: boolean;
}) {
  const [transfers, setTransfers] = useState(initialTransfers);
  const [showForm, setShowForm] = useState(false);
  const [destinoEmpresaId, setDestinoEmpresaId] = useState("");
  const [responsavelEnvio, setResponsavelEnvio] = useState("");
  const [observacao, setObservacao] = useState("");
  const [itens, setItens] = useState<NewItem[]>([{ ingredientId: "", quantidade: "" }]);
  const [error, setError] = useState<string | null>(null);
  const [recebendo, setRecebendo] = useState<Transfer | null>(null);
  const [responsavelRecebimento, setResponsavelRecebimento] = useState("");
  const [quantidades, setQuantidades] = useState<Record<string, string>>({});

  async function refresh() {
    const res = await fetch("/api/estoque/transferencias");
    const data = await res.json();
    setTransfers(
      data.transfers.map((t: Record<string, unknown>) => ({
        id: t.id,
        status: t.status,
        origemNome: (t.origemEmpresa as { name: string }).name,
        origemCor: (t.origemEmpresa as { color: string }).color,
        destinoNome: (t.destinoEmpresa as { name: string }).name,
        destinoCor: (t.destinoEmpresa as { color: string }).color,
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

  function addItem() {
    setItens([...itens, { ingredientId: "", quantidade: "" }]);
  }
  function updateItem(idx: number, patch: Partial<NewItem>) {
    setItens(itens.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  }
  function removeItem(idx: number) {
    setItens(itens.filter((_, i) => i !== idx));
  }

  async function submit() {
    setError(null);
    const validItens = itens
      .filter((it) => it.ingredientId && it.quantidade)
      .map((it) => ({ ingredientId: it.ingredientId, quantidade: it.quantidade, unidade: ingredients.find((i) => i.id === it.ingredientId)?.unidade ?? "" }));
    if (!destinoEmpresaId || validItens.length === 0) {
      setError("Selecione a loja de destino e ao menos um item.");
      return;
    }
    const res = await fetch("/api/estoque/transferencias", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ destinoEmpresaId, responsavelEnvio, observacao, itens: validItens }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.error ?? "Não foi possível registrar a transferência.");
      return;
    }
    setShowForm(false);
    setDestinoEmpresaId("");
    setItens([{ ingredientId: "", quantidade: "" }]);
    refresh();
  }

  async function marcarEnviada(t: Transfer) {
    await fetch(`/api/estoque/transferencias/${t.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "ENVIADA", responsavelEnvio: t.responsavelEnvio }),
    });
    refresh();
  }

  function openRecebimento(t: Transfer) {
    setRecebendo(t);
    setResponsavelRecebimento("");
    const initial: Record<string, string> = {};
    for (const it of t.items) initial[it.id] = String(it.quantidadeEnviada);
    setQuantidades(initial);
  }

  async function confirmarRecebimento() {
    if (!recebendo) return;
    await fetch(`/api/estoque/transferencias/${recebendo.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status: "RECEBIDA",
        responsavelRecebimento,
        quantidadesRecebidas: recebendo.items.map((it) => ({ itemId: it.id, quantidade: Number(quantidades[it.id] ?? it.quantidadeEnviada) })),
      }),
    });
    setRecebendo(null);
    refresh();
  }

  return (
    <div className="space-y-6">
      <Section
        title="Transferências entre lojas"
        action={
          <Toolbar
            onRefresh={refresh}
            onAdd={canCreate ? () => { setError(null); setShowForm(true); } : undefined}
            addLabel="Nova transferência"
          />
        }
      >
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
                const isOrigem = t.origemNome && currentEmpresaId;
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
                        <button onClick={() => marcarEnviada(t)} className="text-xs text-nord-blue-light hover:underline">
                          Marcar enviada
                        </button>
                      )}
                      {canCreate && t.status === "ENVIADA" && (
                        <button onClick={() => openRecebimento(t)} className="text-xs text-emerald-400 hover:underline">
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

      <Modal open={showForm} onClose={() => setShowForm(false)} title="Nova transferência" widthClass="max-w-xl">
        <div className="space-y-3">
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
            {itens.map((it, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <select className="input flex-1" value={it.ingredientId} onChange={(e) => updateItem(idx, { ingredientId: e.target.value })}>
                  <option value="">Produto...</option>
                  {ingredients.map((i) => (
                    <option key={i.id} value={i.id}>{i.name}</option>
                  ))}
                </select>
                <input className="input w-28" type="number" placeholder="Qtd." value={it.quantidade} onChange={(e) => updateItem(idx, { quantidade: e.target.value })} />
                <button onClick={() => removeItem(idx)} className="text-nord-gray hover:text-red-400">
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
            <button onClick={addItem} className="btn-outline">
              <Plus size={13} /> Adicionar item
            </button>
          </div>
          <label className="block">
            <span className="block text-xs text-nord-gray mb-1">Observação</span>
            <input className="input" value={observacao} onChange={(e) => setObservacao(e.target.value)} />
          </label>
          {error && <p className="text-xs text-red-400">{error}</p>}
          <button onClick={submit} className="btn-primary w-full py-2.5">
            Solicitar transferência
          </button>
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
                    value={quantidades[it.id] ?? ""}
                    onChange={(e) => setQuantidades({ ...quantidades, [it.id]: e.target.value })}
                  />
                </div>
              ))}
            </div>
            <button onClick={confirmarRecebimento} className="btn-primary w-full py-2.5">
              Confirmar recebimento
            </button>
          </div>
        )}
      </Modal>
    </div>
  );
}
