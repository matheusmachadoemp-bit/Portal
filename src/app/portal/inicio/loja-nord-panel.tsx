"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Coins, Trophy, ArrowRight } from "lucide-react";
import { Section, ProgressBar } from "@/components/ui/stat-card";
import { FormError } from "@/components/ui/modal";
import { formatNumber } from "@/lib/calc";

// ---------------------------------------------------------------------------
// Card "Loja Nord" — GET /api/inicio/loja-nord?empresaId=X. Assim como
// rotina e alertas, esta rota é sempre "o estado atual do colaborador" (não
// depende do período selecionado no topo da tela), então este painel só
// refaz a busca quando a loja ativa muda.
//
// Tom dourado (#eab308) escolhido a dedo para esta tela: é o mesmo já usado
// no resto do módulo Loja Nord para "conquista" (nível "Ouro" em
// src/lib/loja-nord.ts e medalha de 1º lugar em
// src/app/portal/loja-nord/ranking/ranking-client.tsx), então reaproveitá-lo
// aqui mantém a mesma identidade visual em vez de inventar um tom novo.
// ---------------------------------------------------------------------------

const GOLD = "#eab308";

type LojaNordResponse = {
  saldo: number;
  ganhosNoMes: number;
  posicaoRanking: number | null;
  proximaRecompensa: { nome: string; pontosNecessarios: number } | null;
  progressoProximaRecompensa: number | null;
  top3Loja: { nome: string; pontos: number }[];
};

function LojaNordSkeleton() {
  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 animate-pulse">
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-white/5 shrink-0" />
          <div className="space-y-1.5">
            <div className="h-2.5 w-24 bg-white/5 rounded" />
            <div className="h-6 w-20 bg-white/5 rounded" />
          </div>
        </div>
        <div className="h-3 w-full bg-white/5 rounded pt-2" />
        <div className="h-3 w-2/3 bg-white/5 rounded" />
      </div>
      <div className="space-y-2">
        <div className="h-2.5 w-28 bg-white/5 rounded" />
        <div className="h-3 w-36 bg-white/5 rounded" />
        <div className="h-2 w-full bg-white/5 rounded-full" />
        <div className="h-2.5 w-24 bg-white/5 rounded" />
      </div>
      <div className="space-y-2">
        <div className="h-2.5 w-20 bg-white/5 rounded mb-1" />
        <div className="h-8 w-full bg-white/5 rounded-lg" />
        <div className="h-8 w-full bg-white/5 rounded-lg" />
        <div className="h-8 w-full bg-white/5 rounded-lg" />
      </div>
    </div>
  );
}

export function LojaNordPanel({ empresaId }: { empresaId: string }) {
  const [dados, setDados] = useState<LojaNordResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/inicio/loja-nord?empresaId=${encodeURIComponent(empresaId)}`);
      if (!res.ok) {
        setError("Não foi possível carregar a Loja Nord. Tente novamente em instantes.");
        return;
      }
      setDados(await res.json());
    } catch {
      setError("Não foi possível carregar a Loja Nord. Tente novamente em instantes.");
    } finally {
      setLoading(false);
    }
  }, [empresaId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- busca saldo/ranking ao montar e sempre que a loja ativa muda
    load();
  }, [load]);

  return (
    <Section
      title="Loja Nord"
      action={
        <Link
          href="/portal/loja-nord"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-nord-blue hover:bg-nord-blue-light text-white font-medium transition shrink-0"
        >
          Acessar Loja Nord <ArrowRight size={12} />
        </Link>
      }
    >
      <FormError message={error} />

      {dados === null ? (
        loading ? (
          <LojaNordSkeleton />
        ) : null
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                style={{ backgroundColor: `${GOLD}22` }}
              >
                <Coins size={20} style={{ color: GOLD }} />
              </div>
              <div className="min-w-0">
                <p className="text-nord-gray text-xs">Saldo de pontos</p>
                <p className="text-white text-2xl font-semibold tracking-tight truncate">
                  {formatNumber(dados.saldo)} pts
                </p>
              </div>
            </div>
            <div className="flex items-center justify-between text-xs pt-2 border-t border-nord-border">
              <span className="text-nord-gray">Ganhos no mês</span>
              <span className="text-white font-medium">+{formatNumber(dados.ganhosNoMes)} pts</span>
            </div>
            {dados.posicaoRanking !== null && (
              <div className="flex items-center justify-between text-xs">
                <span className="text-nord-gray">Posição no ranking</span>
                <span className="text-white font-medium">#{formatNumber(dados.posicaoRanking)}</span>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <p className="text-nord-gray text-xs">Próxima recompensa</p>
            {dados.proximaRecompensa && dados.progressoProximaRecompensa !== null ? (
              <>
                <p className="text-white text-sm font-medium truncate">{dados.proximaRecompensa.nome}</p>
                <ProgressBar percent={dados.progressoProximaRecompensa} color={GOLD} />
                <p className="text-[11px] text-nord-gray">
                  Faltam{" "}
                  <span className="text-white font-medium">
                    {formatNumber(Math.max(0, dados.proximaRecompensa.pontosNecessarios - dados.saldo))} pts
                  </span>
                </p>
              </>
            ) : (
              <p className="text-sm text-nord-gray">Nenhuma recompensa disponível no momento.</p>
            )}
          </div>

          <div className="space-y-2">
            <p className="text-nord-gray text-xs mb-1">Top 3 da loja</p>
            {dados.top3Loja.length === 0 ? (
              <p className="text-sm text-nord-gray">Ninguém pontuou nesta loja ainda.</p>
            ) : (
              <div className="space-y-1.5">
                {dados.top3Loja.map((colega, idx) => (
                  <div
                    key={idx}
                    className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg ${idx === 0 ? "bg-white/5" : ""}`}
                  >
                    {idx === 0 ? (
                      <Trophy size={14} style={{ color: GOLD }} className="shrink-0" />
                    ) : (
                      <span className="text-nord-gray text-xs w-[14px] text-center shrink-0">{idx + 1}º</span>
                    )}
                    <span className="text-white text-sm truncate flex-1">{colega.nome}</span>
                    <span className="text-white text-xs font-medium shrink-0">{formatNumber(colega.pontos)} pts</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </Section>
  );
}
