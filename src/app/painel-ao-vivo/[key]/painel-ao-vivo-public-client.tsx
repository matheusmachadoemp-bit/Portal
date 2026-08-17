"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { RefreshCw, FileText, Lock } from "lucide-react";
import { formatCurrency, formatNumber } from "@/lib/calc";
import { PAYMENT_METHOD_LABEL } from "@/lib/vendas-analytics";

const POLL_MS = 15_000;

type Recente = {
  id: string;
  saleNumber: number | null;
  customerName: string | null;
  district: string | null;
  dateTime: string;
  valorTotal: number;
  channel: string;
  channelLabel: string;
  platform: string;
  platformLabel: string;
  formaPagamento: string;
};

type Payload = {
  syncedAt: string;
  integrado: boolean;
  pedidosHoje: number;
  faturamentoHoje: number;
  ticketMedioHoje: number;
  recorde: { pedidos: number; date: string } | null;
  porCanal: { channel: string; label: string; pedidos: number; valor: number }[];
  recentes: Recente[];
  producaoDisponivel: boolean;
};

function formatHora(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}

function formatDataHora(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })
    .format(new Date(iso))
    .replace(",", " ·");
}

function KpiCard({ label, value, hint, color }: { label: string; value: string; hint?: string; color: string }) {
  return (
    <div className="nord-card p-4 flex flex-col gap-2 border-t-2" style={{ borderTopColor: color }}>
      <span className="text-[11px] font-semibold tracking-wide text-nord-gray uppercase">{label}</span>
      <span className="text-3xl font-bold text-white tracking-tight">{value}</span>
      {hint && <span className="text-xs text-nord-gray">{hint}</span>}
    </div>
  );
}

export function PainelAoVivoPublicClient({ empresaKey, empresaName }: { empresaKey: string; empresaName: string }) {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const inFlight = useRef(false);

  const load = useCallback(
    async (manual = false) => {
      if (inFlight.current) return;
      inFlight.current = true;
      if (manual) setRefreshing(true);
      try {
        const res = await fetch(`/api/publico/painel-ao-vivo/${empresaKey}`, { cache: "no-store" });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Não foi possível atualizar o painel.");
        setData(json);
        setError("");
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Falha ao atualizar.");
      } finally {
        inFlight.current = false;
        setLoading(false);
        setRefreshing(false);
      }
    },
    [empresaKey]
  );

  useEffect(() => {
    const initial = setTimeout(() => load(), 0);
    const interval = setInterval(() => load(), POLL_MS);
    return () => {
      clearTimeout(initial);
      clearInterval(interval);
    };
  }, [load]);

  return (
    <div className="min-h-screen bg-nord-black p-5 space-y-5">
      <header className="nord-card px-5 py-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Image src="/logo-nord.svg" alt="" width={110} height={30} />
          <div className="w-px h-8 bg-nord-border" />
          <div>
            <p className="text-sm font-semibold text-white">{empresaName} · Painel ao Vivo</p>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-nord-success opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-nord-success" />
              </span>
              <span className="text-[11px] text-nord-success font-medium">AO VIVO</span>
              <span className="text-[11px] text-nord-gray">
                · {data?.integrado ? "Saipos conectada" : "aguardando integração Saipos"}
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="text-[10px] text-nord-gray uppercase tracking-wide">Última atualização</p>
            <p className="text-sm text-white font-medium">{loading ? "carregando..." : data ? formatDataHora(data.syncedAt) : "—"}</p>
          </div>
          <button
            onClick={() => load(true)}
            className="w-9 h-9 flex items-center justify-center rounded-lg bg-nord-blue hover:bg-nord-blue-light text-white"
            aria-label="Atualizar agora"
          >
            <RefreshCw size={15} className={refreshing ? "animate-spin" : ""} />
          </button>
        </div>
      </header>

      {error && <div className="nord-card p-4 border border-nord-danger/40 text-sm text-nord-danger">{error}</div>}

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        <KpiCard label="Pedidos hoje" value={data ? formatNumber(data.pedidosHoje) : "—"} color="#1464F4" />
        <KpiCard label="Ticket médio" value={data ? formatCurrency(data.ticketMedioHoje) : "—"} color="#22c55e" />
        <KpiCard label="Faturamento hoje" value={data ? formatCurrency(data.faturamentoHoje) : "—"} color="#a855f7" />
        <KpiCard
          label="Recorde de pedidos"
          value={data?.recorde ? formatNumber(data.recorde.pedidos) : "—"}
          hint={data?.recorde ? `maior volume registrado` : undefined}
          color="#f59e0b"
        />
        <div className="nord-card p-4 flex flex-col gap-2 border-t-2 border-dashed border-t-nord-border opacity-70">
          <span className="text-[11px] font-semibold tracking-wide text-nord-gray uppercase flex items-center gap-1">
            <Lock size={11} /> Em produção
          </span>
          <span className="text-lg font-medium text-nord-gray">Aguardando Saipos</span>
        </div>
      </div>

      <div className="nord-card p-4 border border-dashed border-nord-border">
        <div className="flex items-center gap-2 mb-1">
          <Lock size={14} className="text-nord-gray" />
          <h3 className="text-sm font-medium text-white">Em produção · Atrasados · Tempo médio de preparo</h3>
        </div>
        <p className="text-xs text-nord-gray">
          Esses indicadores dependem do status de cozinha (KDS) da Saipos, que ainda não está liberado para este
          Portal — assim que o acesso for concedido, esses cards passam a mostrar dados reais.
        </p>
      </div>

      <div className="nord-card p-4">
        <div className="flex items-center gap-2 mb-4">
          <FileText size={15} className="text-nord-gray" />
          <h3 className="text-white font-medium text-sm">Pedidos de hoje</h3>
          <span className="text-xs text-nord-gray">(ordenado por número do pedido)</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-nord-gray border-b border-nord-border uppercase tracking-wide">
                <th className="pb-2 pr-4">Pedido</th>
                <th className="pb-2 pr-4">Horário</th>
                <th className="pb-2 pr-4">Cliente</th>
                <th className="pb-2 pr-4">Bairro</th>
                <th className="pb-2 pr-4">Canal</th>
                <th className="pb-2 pr-4">Pagamento</th>
                <th className="pb-2 text-right">Valor</th>
              </tr>
            </thead>
            <tbody>
              {data?.recentes.map((r) => (
                <tr key={r.id} className="border-b border-nord-border/50">
                  <td className="py-2.5 pr-4">
                    <strong className="text-white">{r.saleNumber ? `#${r.saleNumber}` : "—"}</strong>
                  </td>
                  <td className="py-2.5 pr-4 text-white">{formatHora(r.dateTime)}</td>
                  <td className="py-2.5 pr-4 text-nord-gray">{r.customerName || "Consumidor não identificado"}</td>
                  <td className="py-2.5 pr-4 text-nord-gray">{r.district || "Não informado"}</td>
                  <td className="py-2.5 pr-4 text-nord-gray">{r.channelLabel}</td>
                  <td className="py-2.5 pr-4 text-nord-gray">{PAYMENT_METHOD_LABEL[r.formaPagamento] ?? r.formaPagamento}</td>
                  <td className="py-2.5 text-right text-white">{formatCurrency(r.valorTotal)}</td>
                </tr>
              ))}
              {data && data.recentes.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-6 text-center text-nord-gray">
                    Nenhum pedido registrado hoje ainda.
                  </td>
                </tr>
              )}
              {!data && !error && (
                <tr>
                  <td colSpan={7} className="py-6 text-center text-nord-gray">
                    Carregando...
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="nord-card p-4">
        <h3 className="text-white font-medium text-sm mb-4">Vendas por canal (hoje)</h3>
        {data && data.porCanal.length === 0 && <p className="text-sm text-nord-gray">Nenhum pedido registrado hoje ainda.</p>}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {data?.porCanal.map((c) => (
            <div key={c.channel} className="rounded-lg border border-nord-border p-3">
              <p className="text-xs text-nord-gray mb-1">{c.label}</p>
              <p className="text-lg font-semibold text-white">{formatNumber(c.pedidos)} pedidos</p>
              <p className="text-xs text-nord-gray">{formatCurrency(c.valor)}</p>
            </div>
          ))}
        </div>
      </div>

      <p className="text-center text-[11px] text-nord-gray">Atualização automática a cada 15 segundos · Portal Nord</p>
    </div>
  );
}
