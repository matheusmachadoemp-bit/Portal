import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { PageContainer } from "@/components/page-container";
import { StatCard } from "@/components/ui/stat-card";
import { startOfMonth, endOfMonth } from "date-fns";
import { GestaoClient } from "./gestao-client";

const GESTOR_ROLES = ["ADMINISTRADOR", "GESTOR", "GERENTE", "SUPERVISOR"];

export default async function GestaoLojaNordPage() {
  const session = await auth();
  if (!session?.user || !GESTOR_ROLES.includes(session.user.role)) {
    redirect("/portal/loja-nord/loja");
  }

  const now = new Date();
  const inicioMes = startOfMonth(now);
  const fimMes = endOfMonth(now);
  const canManageCatalog = session.user.role === "ADMINISTRADOR" || session.user.role === "GESTOR";

  const [
    resgatesPendentes,
    resgatesEntreguesMes,
    pontosDistribuidosMes,
    pontosUtilizadosMes,
    rewards,
    colaboradoresParticipantes,
    empresas,
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
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
          <StatCard label="Resgates pendentes" value={String(resgatesPendentes)} icon="Clock" color="#f59e0b" />
          <StatCard label="Resgates entregues no mês" value={String(resgatesEntreguesMes)} icon="PackageCheck" color="#22c55e" />
          <StatCard label="Pontos distribuídos no mês" value={String(pontosDistribuidosMes._sum.pontos ?? 0)} icon="TrendingUp" color="#1464F4" />
          <StatCard
            label="Pontos utilizados no mês"
            value={String(Math.abs(pontosUtilizadosMes._sum.pontos ?? 0))}
            icon="ShoppingBag"
            color="#ef4444"
          />
          <StatCard label="Brindes com estoque baixo" value={String(estoqueBaixoCount)} icon="AlertTriangle" color="#f59e0b" />
          <StatCard label="Colaboradores participantes" value={String(colaboradoresParticipantes.length)} icon="Users" color="#a855f7" />
        </div>

        <GestaoClient
          canManageCatalog={canManageCatalog}
          empresas={empresas}
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
