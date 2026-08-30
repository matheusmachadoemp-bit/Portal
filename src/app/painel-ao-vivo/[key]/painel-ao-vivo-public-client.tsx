"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { RefreshCw, ClipboardList, ChefHat, Clock3, Timer, Trophy } from "lucide-react";
import { formatCurrency, formatNumber } from "@/lib/calc";
import { PAYMENT_METHOD_LABEL } from "@/lib/vendas-analytics";

const POLL_MS = 15_000;
const SLA_STORAGE_KEY = "nord-painel-sla";

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

function MetricCard({
  icon,
  label,
  value,
  hint,
  color,
  locked,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
  color: string;
  locked?: boolean;
}) {
  return (
    <article className={`nord-card p-4 flex items-center gap-3 ${locked ? "opacity-60" : ""}`}>
      <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: `${color}22`, color }}>
        {icon}
      </div>
      <div className="min-w-0">
        <span className="block text-[10px] font-semibold tracking-wide text-nord-gray uppercase truncate">{label}</span>
        <strong className="block text-2xl font-bold text-white tracking-tight leading-tight">{value}</strong>
        {hint && <span className="block text-[11px] text-nord-gray truncate">{hint}</span>}
      </div>
    </article>
  );
}

export function PainelAoVivoPublicClient({ empresaKey, empresaName }: { empresaKey: string; empresaName: string }) {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sla, setSla] = useState(20);
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
    const initial = setTimeout(() => {
      const saved = Number(localStorage.getItem(SLA_STORAGE_KEY));
      if (saved >= 5 && saved <= 180) setSla(saved);
      load();
    }, 0);
    const interval = setInterval(() => load(), POLL_MS);
    return () => {
      clearTimeout(initial);
      clearInterval(interval);
    };
  }, [load]);

  function saveSla(value: number) {
    const safe = Math.min(180, Math.max(5, value || 20));
    setSla(safe);
    localStorage.setItem(SLA_STORAGE_KEY, String(safe));
  }

  return (
    <div className="min-h-screen bg-nord-black p-5 flex flex-col gap-5">
      <header className="nord-card px-5 py-3 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Image src="/logo-nord.svg" alt="" width={100} height={28} />
          <div className="w-px h-9 bg-nord-border hidden sm:block" />
          <div>
            <div className="flex items-center gap-2">
              <strong className="text-white text-sm">Painel de Operação</strong>
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-nord-success/15 text-nord-success text-[10px] font-semibold">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-nord-success opacity-75" />
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-nord-success" />
                </span>
                AO VIVO
              </span>
              <span
                className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                  data?.integrado ? "bg-nord-success/15 text-nord-success" : "bg-nord-warning/15 text-nord-warning"
                }`}
              >
                {data?.integrado ? "Saipos conectada" : "Saipos desconectada"}
              </span>
            </div>
            <p className="text-[11px] text-nord-gray mt-0.5">{empresaName}</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <label className="flex flex-col items-start">
            <span className="text-[10px] text-nord-gray uppercase tracking-wide mb-1">Meta SLA</span>
            <div className="flex items-center gap-1 bg-nord-panel border border-nord-border rounded-lg px-1">
              <button
                type="button"
                onClick={() => saveSla(sla - 1)}
                className="w-6 h-6 flex items-center justify-center text-nord-gray hover:text-white"
                aria-label="Diminuir meta"
              >
                −
              </button>
              <input
                type="number"
                min={5}
                max={180}
                value={sla}
                onChange={(e) => saveSla(Number(e.target.value))}
                className="w-10 bg-transparent text-center text-sm text-white outline-none"
              />
              <span className="text-[11px] text-nord-gray pr-1">min</span>
              <button
                type="button"
                onClick={() => saveSla(sla + 1)}
                className="w-6 h-6 flex items-center justify-center text-nord-gray hover:text-white"
                aria-label="Aumentar meta"
              >
                +
              </button>
            </div>
          </label>
          <div>
            <p className="text-[10px] text-nord-gray uppercase tracking-wide">Última atualização</p>
            <p className="text-sm text-white font-medium">{loading ? "carregando..." : data ? formatDataHora(data.syncedAt) : "—"}</p>
          </div>
          <button
            onClick={() => load(true)}
            className="w-9 h-9 flex items-center justify-center rounded-lg bg-nord-blue hover:bg-nord-blue-light text-white shrink-0"
            aria-label="Atualizar agora"
          >
            <RefreshCw size={15} className={refreshing ? "animate-spin" : ""} />
          </button>
        </div>
      </header>

      {error && <div className="nord-card p-4 border border-nord-danger/40 text-sm text-nord-danger">{error}</div>}

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <MetricCard
          icon={<ClipboardList size={20} />}
          label="Pedidos hoje"
          value={data ? formatNumber(data.pedidosHoje) : "—"}
          hint={`${empresaName.split(" ")[0]} · turno atual`}
          color="#1464F4"
        />
        <MetricCard icon={<ChefHat size={20} />} label="Em produção" value="—" hint="aguardando Saipos" color="#22d3ee" locked />
        <MetricCard icon={<Clock3 size={20} />} label="Atrasados" value="—" hint={`acima de ${sla} min`} color="#ef4444" locked />
        <MetricCard icon={<Timer size={20} />} label="Tempo médio" value="—" hint="aguardando Saipos" color="#a855f7" locked />
        <MetricCard
          icon={<Trophy size={20} />}
          label="Recorde pedidos"
          value={data?.recorde ? formatNumber(data.recorde.pedidos) : "—"}
          hint="maior volume registrado"
          color="#22c55e"
        />
      </div>

      <div className="nord-card p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-white font-medium text-sm">Pedidos de hoje</h3>
          <span className="text-[11px] text-nord-gray">ordenado por número do pedido</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] text-nord-gray border-b border-nord-border uppercase tracking-wide">
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
                    <span className="block text-[10px] text-nord-gray">ID {r.id.slice(-6)}</span>
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

      <footer className="flex flex-wrap items-center justify-between gap-2 px-1 text-[11px] text-nord-gray">
        <span className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-nord-success inline-block" /> Atualização automática a cada 15 segundos
        </span>
        <span className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-nord-success inline-block" /> Normal
          </span>
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-nord-warning inline-block" /> Atenção
          </span>
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-nord-danger inline-block" /> Atrasado
          </span>
          <span className="text-nord-gray/60">(ativa quando a integração de status chegar)</span>
        </span>
        <span>Portal Nord · Painel de Operação</span>
      </footer>
    </div>
  );
}
