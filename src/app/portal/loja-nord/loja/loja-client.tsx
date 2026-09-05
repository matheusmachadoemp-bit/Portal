"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search, Gift, X } from "lucide-react";
import { Badge, StatCard } from "@/components/ui/stat-card";
import { Modal } from "@/components/ui/modal";
import { DynamicIcon } from "@/components/dynamic-icon";
import { formatNumber } from "@/lib/calc";
import { LOJA_NORD_REWARD_CATEGORY_LABEL, LOJA_NORD_REWARD_CATEGORY_OPTIONS, estoqueBadge } from "@/lib/loja-nord";

type RewardDTO = {
  id: string;
  nome: string;
  descricao: string | null;
  categoria: string;
  imagemUrl: string | null;
  pontos: number;
  estoque: number | null;
  estoqueMinimo: number | null;
  limitePorColaborador: number | null;
  empresaIds: string[];
  regras: string | null;
  disponivelDe: string | null;
  disponivelAte: string | null;
};

const CATEGORY_ICON: Record<string, string> = {
  EXPERIENCIAS: "Sparkles",
  FOLGAS_BENEFICIOS: "CalendarOff",
  BEBIDAS: "Beer",
  ELETRONICOS: "Headphones",
  PRODUTOS_NORD: "Shirt",
  VALE_CONSUMO: "Ticket",
};

export function LojaNordClient({
  initialRewards,
  empresaId,
  initialSaldo,
  initialUtilizadosMes,
  initialPendentes,
}: {
  initialRewards: RewardDTO[];
  empresaId: string | null;
  initialSaldo: number;
  initialUtilizadosMes: number;
  initialPendentes: number;
}) {
  const [rewards] = useState(initialRewards);
  const [saldo, setSaldo] = useState(initialSaldo);
  const [search, setSearch] = useState("");
  const [categoria, setCategoria] = useState("TODOS");
  const [disponibilidade, setDisponibilidade] = useState<"todos" | "disponivel">("todos");
  const [sort, setSort] = useState<"recentes" | "menor_pontos" | "maior_pontos">("recentes");
  const [selected, setSelected] = useState<RewardDTO | null>(null);
  const [redeeming, setRedeeming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const visibleRewards = useMemo(() => {
    let list = rewards.filter((r) => empresaId === null || r.empresaIds.length === 0 || r.empresaIds.includes(empresaId));
    if (categoria !== "TODOS") list = list.filter((r) => r.categoria === categoria);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((r) => r.nome.toLowerCase().includes(q) || r.descricao?.toLowerCase().includes(q));
    }
    if (disponibilidade === "disponivel") list = list.filter((r) => r.estoque === null || r.estoque > 0);
    list = [...list].sort((a, b) => (sort === "maior_pontos" ? b.pontos - a.pontos : sort === "menor_pontos" ? a.pontos - b.pontos : 0));
    return list;
  }, [rewards, categoria, search, disponibilidade, sort, empresaId]);

  async function confirmarResgate() {
    if (!selected) return;
    setRedeeming(true);
    setError(null);
    try {
      const res = await fetch("/api/loja-nord/redemptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rewardId: selected.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Não foi possível concluir o resgate.");
        return;
      }
      setSaldo((s) => s - selected.pontos);
      setSuccessMsg(`Resgate de "${selected.nome}" realizado com sucesso! Acompanhe em Meus Resgates.`);
      setSelected(null);
    } finally {
      setRedeeming(false);
    }
  }

  return (
    <div className="space-y-6">
      {successMsg && (
        <div className="nord-card p-3 flex items-center justify-between bg-nord-success/10 border-nord-success/30">
          <p className="text-sm text-nord-success">{successMsg}</p>
          <button onClick={() => setSuccessMsg(null)} className="text-nord-gray hover:text-white">
            <X size={16} />
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard label="Saldo disponível" value={`${formatNumber(saldo)} pts`} icon="Wallet" color="#1464F4" />
        <StatCard label="Pontos pendentes" value={`${formatNumber(initialPendentes)} pts`} icon="Clock" color="#f59e0b" hint="Em resgates aguardando aprovação" />
        <StatCard label="Pontos utilizados no mês" value={`${formatNumber(initialUtilizadosMes)} pts`} icon="ShoppingBag" color="#ef4444" />
        <Link href="/portal/loja-nord/meus-pontos" className="nord-card p-4 flex flex-col justify-center items-center gap-1.5 hover:border-nord-blue/60 transition-colors">
          <DynamicIcon name="History" size={20} className="text-nord-blue" />
          <span className="text-sm text-white font-medium">Ver histórico de pontos</span>
        </Link>
      </div>

      <div className="nord-card p-3 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-nord-gray" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar brinde..."
            className="input !pl-8"
          />
        </div>
        <select value={disponibilidade} onChange={(e) => setDisponibilidade(e.target.value as typeof disponibilidade)} className="input !w-auto">
          <option value="todos">Todos os brindes</option>
          <option value="disponivel">Só disponíveis</option>
        </select>
        <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} className="input !w-auto">
          <option value="recentes">Mais recentes</option>
          <option value="menor_pontos">Menor quantidade de pontos</option>
          <option value="maior_pontos">Maior quantidade de pontos</option>
        </select>
      </div>

      <nav className="flex flex-wrap gap-2" aria-label="Categorias de brindes">
        {[{ key: "TODOS", label: "Todos" }, ...LOJA_NORD_REWARD_CATEGORY_OPTIONS].map((c) => (
          <button
            key={c.key}
            onClick={() => setCategoria(c.key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
              categoria === c.key ? "border-nord-blue bg-nord-blue text-white" : "border-nord-border text-nord-gray hover:border-nord-blue/60"
            }`}
          >
            {c.label}
          </button>
        ))}
      </nav>

      {visibleRewards.length === 0 ? (
        <div className="nord-card p-8 text-center">
          <Gift size={28} className="text-nord-gray mx-auto mb-3" />
          <p className="text-white text-sm font-medium mb-1">Nenhum brinde encontrado</p>
          <p className="text-xs text-nord-gray">Tente ajustar a busca ou os filtros.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {visibleRewards.map((r) => {
            const badge = estoqueBadge(r.estoque, r.estoqueMinimo);
            const podeResgatar = saldo >= r.pontos && badge.label !== "Sem estoque";
            return (
              <div key={r.id} className="nord-card overflow-hidden flex flex-col">
                <div className="relative h-36 bg-nord-panel flex items-center justify-center">
                  {r.imagemUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- imagens vêm do Vercel Blob (domínio variável), padrão já usado no restante do Portal
                    <img src={r.imagemUrl} alt={r.nome} className="absolute inset-0 w-full h-full object-cover" />
                  ) : (
                    <DynamicIcon name={CATEGORY_ICON[r.categoria] ?? "Gift"} size={36} className="text-nord-gray" />
                  )}
                  <div className="absolute top-2 right-2">
                    <Badge tone={badge.tone}>{badge.label}</Badge>
                  </div>
                </div>
                <div className="p-4 flex flex-col gap-2 flex-1">
                  <Badge tone="default">{LOJA_NORD_REWARD_CATEGORY_LABEL[r.categoria] ?? r.categoria}</Badge>
                  <h3 className="text-white text-sm font-semibold leading-snug">{r.nome}</h3>
                  {r.descricao && <p className="text-xs text-nord-gray line-clamp-2 flex-1">{r.descricao}</p>}
                  {r.limitePorColaborador && (
                    <p className="text-[11px] text-nord-gray">Limite: {r.limitePorColaborador} por colaborador</p>
                  )}
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-white font-semibold text-base">{formatNumber(r.pontos)} pts</span>
                    <button
                      onClick={() => setSelected(r)}
                      disabled={!podeResgatar}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium bg-nord-blue hover:bg-nord-blue-light disabled:opacity-40 disabled:cursor-not-allowed text-white"
                    >
                      Resgatar
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Modal open={!!selected} onClose={() => setSelected(null)} title="Confirmar resgate">
        {selected && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-16 h-16 rounded-lg bg-nord-panel flex items-center justify-center overflow-hidden shrink-0">
                {selected.imagemUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- imagens vêm do Vercel Blob (domínio variável), padrão já usado no restante do Portal
                  <img src={selected.imagemUrl} alt={selected.nome} className="object-cover w-full h-full" />
                ) : (
                  <DynamicIcon name={CATEGORY_ICON[selected.categoria] ?? "Gift"} size={24} className="text-nord-gray" />
                )}
              </div>
              <div>
                <p className="text-white font-medium text-sm">{selected.nome}</p>
                <p className="text-xs text-nord-gray">{formatNumber(selected.pontos)} pontos</p>
              </div>
            </div>

            <div className="nord-card !border-nord-border p-3 space-y-1.5 text-sm">
              <div className="flex justify-between">
                <span className="text-nord-gray">Saldo antes</span>
                <span className="text-white">{formatNumber(saldo)} pts</span>
              </div>
              <div className="flex justify-between">
                <span className="text-nord-gray">Custo do resgate</span>
                <span className="text-nord-danger">-{formatNumber(selected.pontos)} pts</span>
              </div>
              <div className="flex justify-between border-t border-nord-border pt-1.5 font-medium">
                <span className="text-nord-gray">Saldo depois</span>
                <span className="text-white">{formatNumber(saldo - selected.pontos)} pts</span>
              </div>
            </div>

            {selected.regras && (
              <div>
                <p className="text-xs text-nord-gray font-medium mb-1">Regras do benefício</p>
                <p className="text-xs text-nord-gray whitespace-pre-line">{selected.regras}</p>
              </div>
            )}

            {error && <p className="text-xs text-nord-danger">{error}</p>}

            <div className="flex gap-2 pt-1">
              <button
                onClick={() => setSelected(null)}
                className="flex-1 px-4 py-2 text-sm rounded-lg border border-nord-border text-nord-gray hover:text-white hover:border-white/30"
              >
                Cancelar
              </button>
              <button
                onClick={confirmarResgate}
                disabled={redeeming}
                className="flex-1 px-4 py-2 text-sm rounded-lg bg-nord-blue hover:bg-nord-blue-light disabled:opacity-50 text-white font-medium"
              >
                {redeeming ? "Resgatando..." : "Confirmar resgate"}
              </button>
            </div>
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
