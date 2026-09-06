"use client";

import { useCallback, useEffect, useState } from "react";
import { Section } from "@/components/ui/stat-card";
import { SortableStatCards } from "@/components/ui/sortable-stat-cards";
import { FormError } from "@/components/ui/modal";
import { formatNumber } from "@/lib/calc";
import { RotinaPanel } from "./rotina-panel";
import { MinhaMetaPanel } from "./minha-meta-panel";
import { ConquistasPanel } from "./conquistas-panel";
import { LojaNordPanel } from "./loja-nord-panel";

// ---------------------------------------------------------------------------
// Painel de Início do Colaborador — versão simplificada do painel de
// Gerente/Proprietário (gerencial-dashboard-client.tsx): sem seletor de
// período nem troca de loja, só o resumo pessoal do usuário logado.
//
// Os 4 números do topo vêm de GET /api/inicio/colaborador-resumo?empresaId=X
// (buscados aqui, igual aos "Indicadores principais" do painel de Gerente).
// Os demais blocos (rotina, minha meta, conquistas e Loja Nord) buscam os
// próprios dados de forma independente, cada um no seu componente — dois
// deles (RotinaPanel e LojaNordPanel) são os MESMOS componentes já usados no
// painel de Gerente, reaproveitados sem nenhuma alteração.
// ---------------------------------------------------------------------------

type ColaboradorResumoResponse = {
  tarefasHoje: number;
  atividadesConcluidas: number;
  pontosNoMes: number;
  posicaoRanking: number | null;
};

// Mesmo dourado já reservado no resto do módulo Loja Nord para pontos/
// ranking/conquista (ver comentário em loja-nord-panel.tsx) — usado aqui nos
// dois cards que também são "Loja Nord", pra amarrar visualmente com o
// painel da Loja Nord logo abaixo.
const GOLD = "#eab308";

function ResumoSkeleton() {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 animate-pulse">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="h-[124px] bg-white/5 rounded-2xl" />
      ))}
    </div>
  );
}

export function ColaboradorDashboardClient({ empresaId }: { empresaId: string }) {
  const [resumo, setResumo] = useState<ColaboradorResumoResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/inicio/colaborador-resumo?empresaId=${encodeURIComponent(empresaId)}`);
      if (!res.ok) {
        setError("Não foi possível carregar seu resumo. Tente novamente em instantes.");
        return;
      }
      setResumo(await res.json());
    } catch {
      setError("Não foi possível carregar seu resumo. Tente novamente em instantes.");
    } finally {
      setLoading(false);
    }
  }, [empresaId]);

  // Recarrega quando a loja ativa muda, igual aos demais painéis desta tela.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- busca o resumo ao montar e sempre que a loja ativa muda
    load();
  }, [load]);

  return (
    <div className="space-y-6">
      <Section
        title="Meu resumo"
        action={loading && resumo ? <span className="text-xs text-nord-gray animate-pulse">Atualizando...</span> : undefined}
      >
        <FormError message={error} />

        {resumo === null ? (
          loading ? (
            <ResumoSkeleton />
          ) : null
        ) : (
          <SortableStatCards
            storageKey="inicio-colaborador-resumo-order"
            cards={[
              {
                key: "tarefas-hoje",
                label: "Tarefas hoje",
                value: formatNumber(resumo.tarefasHoje),
                icon: "ListTodo",
                href: "/portal/tarefas",
              },
              {
                key: "atividades-concluidas",
                label: "Atividades concluídas (mês)",
                value: formatNumber(resumo.atividadesConcluidas),
                icon: "CheckCircle2",
                hint: "tarefas e checklists",
              },
              {
                key: "pontos-mes",
                label: "Pontos no mês",
                value: formatNumber(resumo.pontosNoMes),
                icon: "Coins",
                color: GOLD,
                href: "/portal/loja-nord",
              },
              {
                key: "posicao-ranking",
                label: "Posição no ranking",
                value: resumo.posicaoRanking !== null ? `#${formatNumber(resumo.posicaoRanking)}` : "—",
                hint: resumo.posicaoRanking !== null ? undefined : "Sem ranking ainda",
                icon: "Trophy",
                color: GOLD,
                href: "/portal/loja-nord/ranking",
              },
            ]}
          />
        )}
      </Section>

      {/*
        Rotina, minha meta, conquistas e Loja Nord não dependem de nenhum
        período selecionado nesta tela (todas essas rotas são sempre
        "agora"/"mês corrente"), então cada painel busca os próprios dados de
        forma independente — inclusive antes do resumo acima terminar de
        carregar — e só refaz a busca quando a loja ativa (empresaId) muda.
      */}
      <RotinaPanel empresaId={empresaId} />
      <MinhaMetaPanel empresaId={empresaId} />
      <ConquistasPanel empresaId={empresaId} />
      <LojaNordPanel empresaId={empresaId} />
    </div>
  );
}
