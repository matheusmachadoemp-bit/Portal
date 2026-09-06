"use client";

import { AlertasPanel } from "./alertas-panel";
import { RotinaPanel } from "./rotina-panel";
import { ColaboradoresSetorPanel } from "./colaboradores-setor-panel";
import { MetasPanel } from "./metas-panel";
import { ManutencaoResumoPanel } from "./manutencao-resumo-panel";
import { LojaNordPanel } from "./loja-nord-panel";

// ---------------------------------------------------------------------------
// Painel de Início do Líder — mesmo padrão dos painéis de Gerente/
// Proprietário (gerencial-dashboard-client.tsx) e do Colaborador
// (colaborador-dashboard-client.tsx): recebe a `empresaId` da loja ativa e
// monta os painéis em sequência. Sem seletor de período nem troca de loja
// própria nesta tela — igual ao painel do Colaborador, a troca de loja
// continua disponível no menu lateral.
//
// Nenhum painel abaixo precisa de uma prop além de `empresaId`: cada rota de
// /api/inicio/* que eles consomem já filtra pelo setor do Líder sozinha, por
// baixo dos panos, a partir da ficha de RH ligada ao login (ver o comentário
// grande acima de `loadSetorDoLider` em src/lib/inicio.ts):
// - AlertasPanel / RotinaPanel: já eram genéricos para qualquer perfil, sem
//   nenhuma alteração.
// - ColaboradoresSetorPanel: painel novo desta etapa, exclusivo do Líder.
// - MetasPanel (GET /api/inicio/metas-setores) e ManutencaoResumoPanel
//   (GET /api/inicio/manutencao-resumo): mesmos componentes já usados no
//   painel de Gerente — a rota que cada um consome já devolve só o setor do
//   Líder quando quem chama tem esse perfil.
// - LojaNordPanel: pontos/ranking, igual para qualquer perfil.
// ---------------------------------------------------------------------------

export function LiderDashboardClient({ empresaId }: { empresaId: string }) {
  return (
    <div className="space-y-6">
      <AlertasPanel empresaId={empresaId} />
      <RotinaPanel empresaId={empresaId} />
      <ColaboradoresSetorPanel empresaId={empresaId} />
      <MetasPanel empresaId={empresaId} />
      <ManutencaoResumoPanel empresaId={empresaId} />
      <LojaNordPanel empresaId={empresaId} />
    </div>
  );
}
