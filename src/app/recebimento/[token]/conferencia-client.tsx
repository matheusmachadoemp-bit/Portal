"use client";

import { useMemo, useState } from "react";
import { upload } from "@vercel/blob/client";
import { Camera, CheckCircle2, ChevronRight, Minus, Plus, X } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Badge } from "@/components/ui/stat-card";
import { formatCurrency, formatNumber } from "@/lib/calc";
import { sanitizeFileName } from "@/lib/upload";
import { RECEIVING_ITEM_DIVERGENCE_LABEL, RECEIVING_ITEM_DIVERGENCE_REQUIRES_PHOTO } from "@/lib/estoque";

type Conferencia = {
  status: string;
  quantidadeRecebida: number | null;
  pesoAferido: number | null;
  temperaturaAferida: number | null;
  validadeInformada: string | null;
  precoInformado: number | null;
  fotoUrl: string | null;
  divergenciaTipos: string | null;
  divergenciaDescricao: string | null;
};
type Item = {
  id: string;
  nome: string;
  unidade: string;
  quantidadePedida: number;
  valorUnitario: number;
  valorTotal: number;
  exigirPeso: boolean;
  exigirValidade: boolean;
  exigirTemperatura: boolean;
  exigirFoto: boolean;
  conferencia: Conferencia | null;
};
type Purchase = {
  id: string;
  numero: string;
  status: string;
  data: string;
  previsaoEntrega: string | null;
  valorPrevisto: number;
  supplierName: string;
  responsavelNome: string | null;
  receivingIniciado: boolean;
  itens: Item[];
};

const DIVERGENCE_KEYS = Object.keys(RECEIVING_ITEM_DIVERGENCE_LABEL);

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

export function ConferenciaClient({ token, purchase, empresaName }: { token: string; purchase: Purchase; empresaName: string }) {
  const [started, setStarted] = useState(purchase.receivingIniciado);
  const [starting, setStarting] = useState(false);
  const [itens, setItens] = useState<Item[]>(
    purchase.itens.map((it) => ({
      ...it,
      conferencia: it.conferencia ?? {
        status: "NAO_CONFERIDO",
        quantidadeRecebida: it.quantidadePedida,
        pesoAferido: null,
        temperaturaAferida: null,
        validadeInformada: null,
        precoInformado: it.valorUnitario,
        fotoUrl: null,
        divergenciaTipos: null,
        divergenciaDescricao: null,
      },
    }))
  );
  const [divergindo, setDivergindo] = useState<Item | null>(null);
  const [divergenciaTipos, setDivergenciaTipos] = useState<string[]>([]);
  const [divergenciaDescricao, setDivergenciaDescricao] = useState("");
  const [uploadingFoto, setUploadingFoto] = useState(false);
  const [fotoUrl, setFotoUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [finalizando, setFinalizando] = useState(false);
  const [resultado, setResultado] = useState<{ houveDivergencia: boolean } | null>(null);
  const [showResumo, setShowResumo] = useState(false);
  const [numeroNota, setNumeroNota] = useState("");
  const [valorNota, setValorNota] = useState("");
  const [fotoNotaUrl, setFotoNotaUrl] = useState<string | null>(null);
  const [uploadingFotoNota, setUploadingFotoNota] = useState(false);

  const conferidos = itens.filter((it) => it.conferencia?.status !== "NAO_CONFERIDO").length;
  const progresso = itens.length > 0 ? Math.round((conferidos / itens.length) * 100) : 0;
  const podeFinalizar = conferidos === itens.length;

  async function iniciar() {
    setStarting(true);
    setError(null);
    const res = await fetch(`/api/estoque/recebimento/responder/${token}`, { method: "POST" });
    setStarting(false);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.error ?? "Não foi possível iniciar o recebimento.");
      return;
    }
    setStarted(true);
  }

  function updateItemLocal(id: string, patch: Partial<Conferencia>) {
    setItens((prev) => prev.map((it) => (it.id === id ? { ...it, conferencia: { ...it.conferencia!, ...patch } } : it)));
  }

  async function salvarConforme(item: Item) {
    setError(null);
    const res = await fetch(`/api/estoque/recebimento/responder/${token}/item/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        condicao: "CONFORME",
        quantidadeRecebida: item.conferencia?.quantidadeRecebida,
        pesoAferido: item.conferencia?.pesoAferido,
        temperaturaAferida: item.conferencia?.temperaturaAferida,
        validadeInformada: item.conferencia?.validadeInformada,
        precoInformado: item.conferencia?.precoInformado,
      }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.error ?? "Não foi possível salvar a conferência.");
      return;
    }
    updateItemLocal(item.id, { status: "CONFERIDO" });
  }

  function abrirDivergencia(item: Item) {
    setDivergindo(item);
    setDivergenciaTipos(item.conferencia?.divergenciaTipos?.split(",").filter(Boolean) ?? []);
    setDivergenciaDescricao(item.conferencia?.divergenciaDescricao ?? "");
    setFotoUrl(item.conferencia?.fotoUrl ?? null);
    setError(null);
  }

  function toggleTipo(key: string) {
    setDivergenciaTipos((prev) => (prev.includes(key) ? prev.filter((t) => t !== key) : [...prev, key]));
  }

  async function tirarFoto(file: File) {
    setUploadingFoto(true);
    try {
      const blob = await upload(sanitizeFileName(file.name), file, {
        access: "public",
        handleUploadUrl: `/api/estoque/recebimento/responder/${token}/upload`,
      });
      setFotoUrl(blob.url);
    } catch {
      setError("Não foi possível enviar a foto. Tente novamente.");
    } finally {
      setUploadingFoto(false);
    }
  }

  async function salvarDivergencia() {
    if (!divergindo) return;
    setError(null);
    if (divergenciaTipos.length === 0) {
      setError("Selecione ao menos um tipo de divergência.");
      return;
    }
    const precisaFoto = divergenciaTipos.some((t) => RECEIVING_ITEM_DIVERGENCE_REQUIRES_PHOTO.has(t));
    if (precisaFoto && !fotoUrl) {
      setError("Adicione uma foto para comprovar essa divergência.");
      return;
    }
    const res = await fetch(`/api/estoque/recebimento/responder/${token}/item/${divergindo.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        condicao: "DIVERGENCIA",
        quantidadeRecebida: divergindo.conferencia?.quantidadeRecebida,
        pesoAferido: divergindo.conferencia?.pesoAferido,
        temperaturaAferida: divergindo.conferencia?.temperaturaAferida,
        validadeInformada: divergindo.conferencia?.validadeInformada,
        precoInformado: divergindo.conferencia?.precoInformado,
        fotoUrl,
        divergenciaTipos,
        divergenciaDescricao,
      }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.error ?? "Não foi possível registrar a divergência.");
      return;
    }
    const naoRecebido = divergenciaTipos.includes("PRODUTO_NAO_ENTREGUE");
    updateItemLocal(divergindo.id, {
      status: naoRecebido ? "NAO_RECEBIDO" : "DIVERGENCIA",
      fotoUrl,
      divergenciaTipos: divergenciaTipos.join(","),
      divergenciaDescricao,
    });
    setDivergindo(null);
  }

  async function tirarFotoNota(file: File) {
    setUploadingFotoNota(true);
    try {
      const blob = await upload(sanitizeFileName(file.name), file, {
        access: "public",
        handleUploadUrl: `/api/estoque/recebimento/responder/${token}/upload`,
      });
      setFotoNotaUrl(blob.url);
    } catch {
      setError("Não foi possível enviar a foto da nota. Tente novamente.");
    } finally {
      setUploadingFotoNota(false);
    }
  }

  async function finalizar() {
    setFinalizando(true);
    setError(null);
    const res = await fetch(`/api/estoque/recebimento/responder/${token}/finalizar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ numeroNota, valorNota: valorNota || null, fotoNotaUrl }),
    });
    setFinalizando(false);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.error ?? "Não foi possível finalizar o recebimento.");
      return;
    }
    const data = await res.json();
    setResultado({ houveDivergencia: data.houveDivergencia });
  }

  const divergenciasCount = useMemo(
    () => itens.filter((it) => it.conferencia?.status === "DIVERGENCIA" || it.conferencia?.status === "NAO_RECEBIDO").length,
    [itens]
  );

  const valorPedido = useMemo(() => itens.reduce((s, it) => s + it.valorTotal, 0), [itens]);
  const valorRecebido = useMemo(
    () => itens.reduce((s, it) => s + (it.conferencia?.quantidadeRecebida ?? 0) * (it.conferencia?.precoInformado ?? it.valorUnitario), 0),
    [itens]
  );
  const valorNotaNum = valorNota ? Number(valorNota) : null;
  const diferencaValor = (valorNotaNum ?? valorRecebido) - valorPedido;

  if (resultado) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="w-full max-w-sm text-center space-y-3">
          <CheckCircle2 size={40} className={resultado.houveDivergencia ? "text-nord-warning mx-auto" : "text-nord-success mx-auto"} />
          <h1 className="text-white font-semibold text-lg">Recebimento finalizado!</h1>
          <p className="text-nord-gray text-sm">
            {resultado.houveDivergencia
              ? `O pedido #${purchase.numero} foi recebido com ${divergenciasCount} divergência(s).`
              : `O pedido #${purchase.numero} foi recebido sem divergências.`}
          </p>
        </div>
      </div>
    );
  }

  if (showResumo) {
    const semDivergencia = divergenciasCount === 0;
    return (
      <div className="max-w-md mx-auto min-h-screen flex flex-col p-5 pb-8">
        <button onClick={() => setShowResumo(false)} className="text-xs text-nord-gray hover:text-white self-start mb-1">
          ← Voltar
        </button>
        <h1 className="text-white font-semibold text-lg">Finalizar recebimento</h1>
        <p className="text-nord-gray text-xs">
          {itens.length} produto(s) verificado(s) — {itens.length - divergenciasCount} conforme(s), {divergenciasCount} divergência(s)
        </p>

        {!semDivergencia && (
          <div className="mt-3 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3">
            <p className="text-sm text-amber-300 font-medium">{divergenciasCount} divergência(s) encontrada(s)</p>
            <p className="text-xs text-nord-gray mt-0.5">Revise os itens abaixo antes de finalizar.</p>
          </div>
        )}

        {!semDivergencia && (
          <div className="space-y-2 mt-3">
            {itens
              .filter((it) => it.conferencia?.status === "DIVERGENCIA" || it.conferencia?.status === "NAO_RECEBIDO")
              .map((it) => {
                const c = it.conferencia!;
                const diferenca = (c.quantidadeRecebida ?? 0) - it.quantidadePedida;
                return (
                  <div key={it.id} className="nord-card p-3 text-sm">
                    <p className="text-white font-medium">{it.nome}</p>
                    <p className="text-nord-gray text-xs">
                      Pedido: {formatNumber(it.quantidadePedida)} {it.unidade} | Recebido: {formatNumber(c.quantidadeRecebida ?? 0)} {it.unidade}
                    </p>
                    {diferenca !== 0 && (
                      <p className="text-red-300 text-xs mt-0.5">
                        Diferença: {diferenca > 0 ? "+" : ""}
                        {formatNumber(diferenca)} {it.unidade}
                      </p>
                    )}
                  </div>
                );
              })}
          </div>
        )}

        <div className="nord-card p-4 mt-4 space-y-3">
          <span className="block text-sm text-white font-medium">Nota fiscal</span>
          <label className="block">
            <span className="block text-[11px] text-nord-gray mb-1">Número da NF</span>
            <input className="input" value={numeroNota} onChange={(e) => setNumeroNota(e.target.value)} />
          </label>
          <label className="block">
            <span className="block text-[11px] text-nord-gray mb-1">Valor da nota (R$)</span>
            <input type="number" className="input" value={valorNota} onChange={(e) => setValorNota(e.target.value)} />
          </label>
          {fotoNotaUrl ? (
            <div className="relative w-24 h-24">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={fotoNotaUrl} alt="Foto da nota fiscal" className="w-24 h-24 object-cover rounded-lg" />
              <button
                onClick={() => setFotoNotaUrl(null)}
                className="absolute -top-1.5 -right-1.5 bg-nord-black rounded-full p-0.5 border border-nord-border"
              >
                <X size={12} className="text-white" />
              </button>
            </div>
          ) : (
            <label className="w-24 h-24 rounded-lg border border-dashed border-nord-border flex flex-col items-center justify-center gap-1 cursor-pointer text-nord-gray">
              <Camera size={18} />
              <span className="text-[10px]">{uploadingFotoNota ? "Enviando..." : "Foto da nota"}</span>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                disabled={uploadingFotoNota}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) tirarFotoNota(file);
                }}
              />
            </label>
          )}
        </div>

        <div className="nord-card p-4 mt-3 space-y-1.5 text-sm">
          <span className="block text-white font-medium mb-1">Resumo financeiro</span>
          <div className="flex justify-between">
            <span className="text-nord-gray">Valor do pedido</span>
            <span className="text-white">{formatCurrency(valorPedido)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-nord-gray">Valor da nota (informado)</span>
            <span className="text-white">{formatCurrency(valorNotaNum ?? valorRecebido)}</span>
          </div>
          <div className="flex justify-between pt-1.5 border-t border-nord-border">
            <span className="text-nord-gray">Diferença</span>
            <span className={diferencaValor === 0 ? "text-white" : "text-red-300"}>
              {diferencaValor > 0 ? "+" : ""}
              {formatCurrency(diferencaValor)}
            </span>
          </div>
        </div>

        {error && (
          <div className="mt-3 rounded-lg border border-red-500/40 bg-red-500/5 p-2.5">
            <p className="text-xs text-red-300">{error}</p>
          </div>
        )}

        <button
          onClick={finalizar}
          disabled={finalizando}
          className={`w-full py-3 mt-5 rounded-lg text-sm font-medium text-white ${semDivergencia ? "btn-primary" : "bg-nord-warning hover:brightness-110"}`}
        >
          {finalizando ? "Enviando..." : semDivergencia ? "Confirmar recebimento" : "Confirmar recebimento com divergência"}
        </button>
      </div>
    );
  }

  if (!started) {
    return (
      <div className="max-w-md mx-auto min-h-screen flex flex-col p-5">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs text-nord-gray">{empresaName}</span>
        </div>
        <h1 className="text-white font-semibold text-lg">Recebimento</h1>
        <p className="text-nord-gray text-sm mt-0.5">{purchase.supplierName} — Pedido #{purchase.numero}</p>

        <div className="nord-card p-4 mt-4 space-y-2.5">
          <div className="flex items-center justify-between text-sm">
            <span className="text-nord-gray">Status</span>
            <Badge tone="warning">Aguardando conferência</Badge>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-nord-gray">Previsão</span>
            <span className="text-white">{fmtDate(purchase.previsaoEntrega)}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-nord-gray">Produtos</span>
            <span className="text-white">{itens.length}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-nord-gray">Valor previsto</span>
            <span className="text-white">{formatCurrency(purchase.valorPrevisto)}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-nord-gray">Responsável</span>
            <span className="text-white">{purchase.responsavelNome ?? "—"}</span>
          </div>
        </div>

        {error && (
          <div className="mt-3 rounded-lg border border-red-500/40 bg-red-500/5 p-2.5">
            <p className="text-xs text-red-300">{error}</p>
          </div>
        )}

        <button onClick={iniciar} disabled={starting} className="btn-primary w-full py-3 mt-6">
          {starting ? "Iniciando..." : "Iniciar recebimento"}
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto min-h-screen flex flex-col p-5 pb-8">
      <h1 className="text-white font-semibold text-lg">{purchase.supplierName}</h1>
      <p className="text-nord-gray text-xs">Pedido #{purchase.numero}</p>

      <div className="flex items-center gap-2 mt-3">
        <div className="flex-1 h-1.5 rounded-full bg-nord-border overflow-hidden">
          <div className="h-full rounded-full bg-nord-blue transition-all" style={{ width: `${progresso}%` }} />
        </div>
        <span className="text-[11px] text-nord-gray shrink-0">
          {conferidos} de {itens.length} produtos
        </span>
      </div>

      {error && (
        <div className="mt-3 rounded-lg border border-red-500/40 bg-red-500/5 p-2.5">
          <p className="text-xs text-red-300">{error}</p>
        </div>
      )}

      <div className="space-y-3 mt-4">
        {itens.map((item) => {
          const c = item.conferencia!;
          const diferencaQtd = (c.quantidadeRecebida ?? 0) - item.quantidadePedida;
          const valorRecebido = (c.quantidadeRecebida ?? 0) * (c.precoInformado ?? item.valorUnitario);
          const diferencaValor = valorRecebido - item.valorTotal;
          return (
            <div key={item.id} className="nord-card p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-white font-medium text-sm">{item.nome}</span>
                <Badge
                  tone={
                    c.status === "CONFERIDO" ? "success" : c.status === "NAO_CONFERIDO" ? "default" : "danger"
                  }
                >
                  {c.status === "NAO_CONFERIDO"
                    ? "Não conferido"
                    : c.status === "CONFERIDO"
                      ? "Conferido"
                      : c.status === "NAO_RECEBIDO"
                        ? "Não recebido"
                        : "Divergência"}
                </Badge>
              </div>
              <p className="text-xs text-nord-gray">
                Pedido: {formatNumber(item.quantidadePedida)} {item.unidade} · {formatCurrency(item.valorUnitario)}/{item.unidade}
              </p>

              <div>
                <span className="block text-[11px] text-nord-gray mb-1">Quantidade recebida</span>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => updateItemLocal(item.id, { quantidadeRecebida: Math.max(0, (c.quantidadeRecebida ?? 0) - 1) })}
                    className="w-10 h-10 rounded-lg bg-nord-panel border border-nord-border text-white flex items-center justify-center"
                  >
                    <Minus size={16} />
                  </button>
                  <span className="text-white text-lg font-semibold flex-1 text-center tabular-nums">
                    {formatNumber(c.quantidadeRecebida ?? 0)} {item.unidade}
                  </span>
                  <button
                    onClick={() => updateItemLocal(item.id, { quantidadeRecebida: (c.quantidadeRecebida ?? 0) + 1 })}
                    className="w-10 h-10 rounded-lg bg-nord-panel border border-nord-border text-white flex items-center justify-center"
                  >
                    <Plus size={16} />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <label className="block">
                  <span className="block text-[11px] text-nord-gray mb-1">Preço da nota</span>
                  <input
                    type="number"
                    className="input"
                    value={c.precoInformado ?? ""}
                    onChange={(e) => updateItemLocal(item.id, { precoInformado: e.target.value ? Number(e.target.value) : null })}
                  />
                </label>
                {item.exigirValidade && (
                  <label className="block">
                    <span className="block text-[11px] text-nord-gray mb-1">Validade</span>
                    <input
                      type="date"
                      className="input"
                      value={c.validadeInformada ? c.validadeInformada.slice(0, 10) : ""}
                      onChange={(e) => updateItemLocal(item.id, { validadeInformada: e.target.value || null })}
                    />
                  </label>
                )}
                {item.exigirPeso && (
                  <label className="block">
                    <span className="block text-[11px] text-nord-gray mb-1">Peso aferido (kg)</span>
                    <input
                      type="number"
                      className="input"
                      value={c.pesoAferido ?? ""}
                      onChange={(e) => updateItemLocal(item.id, { pesoAferido: e.target.value ? Number(e.target.value) : null })}
                    />
                  </label>
                )}
                {item.exigirTemperatura && (
                  <label className="block">
                    <span className="block text-[11px] text-nord-gray mb-1">Temperatura (°C)</span>
                    <input
                      type="number"
                      className="input"
                      value={c.temperaturaAferida ?? ""}
                      onChange={(e) => updateItemLocal(item.id, { temperaturaAferida: e.target.value ? Number(e.target.value) : null })}
                    />
                  </label>
                )}
              </div>

              {(diferencaQtd !== 0 || c.status === "DIVERGENCIA" || c.status === "NAO_RECEBIDO") && c.status !== "NAO_CONFERIDO" && (
                <div className="rounded-lg bg-red-950/30 border border-red-900/60 p-2.5 text-xs space-y-0.5">
                  {diferencaQtd !== 0 && (
                    <p className="text-red-300">
                      Diferença: {diferencaQtd > 0 ? "+" : ""}
                      {formatNumber(diferencaQtd)} {item.unidade} ({diferencaValor > 0 ? "+" : ""}
                      {formatCurrency(diferencaValor)})
                    </p>
                  )}
                  {c.divergenciaTipos && (
                    <p className="text-red-300">
                      {c.divergenciaTipos
                        .split(",")
                        .map((t) => RECEIVING_ITEM_DIVERGENCE_LABEL[t] ?? t)
                        .join(", ")}
                    </p>
                  )}
                </div>
              )}

              <div className="flex items-center gap-2 pt-1">
                <button
                  onClick={() => salvarConforme(item)}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium ${
                    c.status === "CONFERIDO" ? "bg-nord-success/20 text-nord-success" : "bg-nord-panel border border-nord-border text-white"
                  }`}
                >
                  Conforme
                </button>
                <button
                  onClick={() => abrirDivergencia(item)}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium ${
                    c.status === "DIVERGENCIA" || c.status === "NAO_RECEBIDO"
                      ? "bg-nord-danger/20 text-nord-danger"
                      : "bg-nord-panel border border-nord-border text-white"
                  }`}
                >
                  Divergência
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <button
        onClick={() => setShowResumo(true)}
        disabled={!podeFinalizar}
        className="btn-primary w-full py-3 mt-5 flex items-center justify-center gap-1.5"
      >
        Finalizar recebimento <ChevronRight size={16} />
      </button>
      {!podeFinalizar && (
        <p className="text-[11px] text-nord-gray text-center mt-2">Confira todos os produtos para liberar a finalização.</p>
      )}

      <Modal open={!!divergindo} onClose={() => setDivergindo(null)} title="Registrar divergência" widthClass="max-w-md">
        {divergindo && (
          <div className="space-y-3">
            <span className="block text-xs text-nord-gray">Qual o problema?</span>
            <div className="flex flex-wrap gap-2">
              {DIVERGENCE_KEYS.map((key) => (
                <label
                  key={key}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs cursor-pointer ${
                    divergenciaTipos.includes(key) ? "border-nord-blue text-white bg-nord-blue/10" : "border-nord-border text-nord-gray"
                  }`}
                >
                  <input type="checkbox" className="hidden" checked={divergenciaTipos.includes(key)} onChange={() => toggleTipo(key)} />
                  {RECEIVING_ITEM_DIVERGENCE_LABEL[key]}
                </label>
              ))}
            </div>
            <label className="block">
              <span className="block text-xs text-nord-gray mb-1">Descrição da divergência</span>
              <textarea
                className="input min-h-20"
                maxLength={300}
                value={divergenciaDescricao}
                onChange={(e) => setDivergenciaDescricao(e.target.value)}
              />
            </label>
            <div>
              <span className="block text-xs text-nord-gray mb-1.5">
                Adicionar foto {!fotoUrl && divergenciaTipos.some((t) => RECEIVING_ITEM_DIVERGENCE_REQUIRES_PHOTO.has(t)) ? "(obrigatório)" : "(opcional)"}
              </span>
              {fotoUrl ? (
                <div className="relative w-24 h-24">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={fotoUrl} alt="Foto da divergência" className="w-24 h-24 object-cover rounded-lg" />
                  <button
                    onClick={() => setFotoUrl(null)}
                    className="absolute -top-1.5 -right-1.5 bg-nord-black rounded-full p-0.5 border border-nord-border"
                  >
                    <X size={12} className="text-white" />
                  </button>
                </div>
              ) : (
                <label className="w-24 h-24 rounded-lg border border-dashed border-nord-border flex flex-col items-center justify-center gap-1 cursor-pointer text-nord-gray">
                  <Camera size={18} />
                  <span className="text-[10px]">{uploadingFoto ? "Enviando..." : "Tirar foto"}</span>
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    disabled={uploadingFoto}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) tirarFoto(file);
                    }}
                  />
                </label>
              )}
            </div>
            {error && <p className="text-xs text-red-400">{error}</p>}
            <button onClick={salvarDivergencia} className="btn-primary w-full py-2.5">
              Salvar divergência
            </button>
          </div>
        )}
      </Modal>

      <style jsx global>{`
        .input {
          width: 100%;
          background: var(--nord-panel);
          border: 1px solid var(--nord-border);
          border-radius: 8px;
          padding: 8px 12px;
          color: white;
          font-size: 13px;
          outline: none;
        }
        .input:focus {
          border-color: var(--nord-blue);
        }
      `}</style>
    </div>
  );
}
