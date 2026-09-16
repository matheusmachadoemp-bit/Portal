import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { hasModulePermission } from "@/lib/authz";
import { empresaIdsForContext, getActiveEmpresaContext, getSelectableTeamMembers } from "@/lib/empresa";
import { PageContainer } from "@/components/page-container";
import { SortableStatCards } from "@/components/ui/sortable-stat-cards";
import { startOfMonth, endOfMonth } from "date-fns";
import { GestaoClient } from "./gestao-client";

const GESTOR_ROLES = ["ADMINISTRADOR", "GESTOR", "GERENTE", "SUPERVISOR"];

export default async function GestaoLojaNordPage() {
  const session = await auth();
  if (!session?.user || !GESTOR_ROLES.includes(session.user.role)) {
    redirect("/portal/loja-nord/loja");
  }
  // Perfil de Permissão é uma camada ADICIONAL à checagem de cargo acima — permite que um
  // Administrador restrinja um GESTOR/GERENTE/SUPERVISOR específico de ver a Gestão da Loja
  // Nord, mesmo o cargo dele normalmente permitindo (mesmo raciocínio de Usuários no lote
  // crítico; ver comentário em @/lib/authz).
  if (!(await hasModulePermission(session.user.id, "loja-nord", "canView"))) {
    redirect("/portal/loja-nord/loja");
  }

  const now = new Date();
  const inicioMes = startOfMonth(now);
  const fimMes = endOfMonth(now);
  const canManageCatalog = session.user.role === "ADMINISTRADOR" || session.user.role === "GESTOR";

  // Só para escopar `colaboradores` (seletor de "lançar pontos" abaixo) à(s) loja(s) que este
  // usuário tem acesso — GESTOR_ROLES inclui GERENTE/SUPERVISOR, que normalmente só administram
  // lojas específicas (o catálogo de brindes em si, `empresas` logo abaixo, continua listando
  // todas as lojas ativas: só ADMINISTRADOR/GESTOR enxergam `canManageCatalog`, e esses dois
  // cargos já têm acesso a toda a rede mesmo).
  const ctx = await getActiveEmpresaContext();
  const empresaIds = ctx ? empresaIdsForContext(ctx) : [];

  const [
    resgatesPendentes,
    resgatesEntreguesMes,
    pontosDistribuidosMes,
    pontosUtilizadosMes,
    rewards,
    colaboradoresParticipantes,
    empresas,
    colaboradores,
    redemptions,
  ] = await Promise.all([
    prisma.lojaNordRedemption.count({ where: { status: "AGUARDANDO_APROVACAO" } }),
    prisma.lojaNordRedemption.count({ where: { status: "ENTREGUE", updatedAt: { gte: inicioMes, lte: fimMes } } }),
    prisma.lojaNordPointTransaction.aggregate({
      where: { pontos: { gt: 0 }, createdAt: { gte: inicioMes, lte: fimMes } },
      _sum: { pontos: true },
    }),
    prisma.lojaNordPointTransaction.aggregate({
      where: { pontos: { lt: 0 }, createdAt: { gte: inicioMes, lte: fimMes } },
      _sum: { pontos: true },
    }),
    prisma.lojaNordReward.findMany({ orderBy: { createdAt: "desc" } }),
    prisma.lojaNordPointTransaction.findMany({ select: { userId: true }, distinct: ["userId"] }),
    prisma.empresa.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { order: "asc" } }),
    getSelectableTeamMembers(empresaIds),
    prisma.lojaNordRedemption.findMany({
      where: { status: { in: ["AGUARDANDO_APROVACAO", "APROVADO", "DISPONIVEL_RETIRADA"] } },
      orderBy: { createdAt: "asc" },
      include: {
        user: { select: { name: true } },
        empresa: { select: { name: true } },
        reward: { select: { nome: true } },
      },
    }),
  ]);

  const estoqueBaixoCount = rewards.filter(
    (r) => r.active && r.estoque !== null && r.estoqueMinimo !== null && r.estoque <= r.estoqueMinimo
  ).length;

  return (
    <PageContainer title="Gestão da Loja Nord" subtitle="Aprovação de resgates, catálogo de brindes e indicadores">
      <div className="space-y-6">
        <SortableStatCards
          storageKey="loja-nord-gestao-kpi-order"
          className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4"
          cards={[
            { key: "resgates-pendentes", label: "Resgates pendentes", value: String(resgatesPendentes), icon: "Clock", color: "#f59e0b" },
            { key: "resgates-entregues-mes", label: "Resgates entregues no mês", value: String(resgatesEntreguesMes), icon: "PackageCheck", color: "#22c55e" },
            { key: "pontos-distribuidos-mes", label: "Pontos distribuídos no mês", value: String(pontosDistribuidosMes._sum.pontos ?? 0), icon: "TrendingUp", color: "#1464F4" },
            {
              key: "pontos-utilizados-mes",
              label: "Pontos utilizados no mês",
              value: String(Math.abs(pontosUtilizadosMes._sum.pontos ?? 0)),
              icon: "ShoppingBag",
              color: "#ef4444",
            },
            { key: "brindes-estoque-baixo", label: "Brindes com estoque baixo", value: String(estoqueBaixoCount), icon: "AlertTriangle", color: "#f59e0b" },
            { key: "colaboradores-participantes", label: "Colaboradores participantes", value: String(colaboradoresParticipantes.length), icon: "Users", color: "#a855f7" },
          ]}
        />

        <GestaoClient
          canManageCatalog={canManageCatalog}
          empresas={empresas}
          colaboradores={colaboradores}
          initialRewards={rewards.map((r) => ({
            ...r,
            createdAt: r.createdAt.toISOString(),
            updatedAt: r.updatedAt.toISOString(),
            disponivelDe: r.disponivelDe?.toISOString() ?? null,
            disponivelAte: r.disponivelAte?.toISOString() ?? null,
          }))}
          initialRedemptions={redemptions.map((r) => ({
            id: r.id,
            colaboradorNome: r.user.name,
            empresaNome: r.empresa.name,
            rewardNome: r.reward.nome,
            pontos: r.pontos,
            status: r.status,
            createdAt: r.createdAt.toISOString(),
          }))}
        />
      </div>
    </PageContainer>
  );
}
