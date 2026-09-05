import { prisma } from "@/lib/prisma";
import { PageContainer } from "@/components/page-container";
import { auth } from "@/auth";
import { getActiveEmpresaContext } from "@/lib/empresa";
import { getPontosNoPeriodo, getPontosPendentesAprovacao, getSaldoAtual } from "@/lib/loja-nord-server";
import { LojaNordClient } from "./loja-client";
import { startOfMonth, endOfMonth } from "date-fns";

export default async function LojaNordCatalogoPage() {
  const [session, ctx] = await Promise.all([auth(), getActiveEmpresaContext()]);
  const empresaId = ctx?.mode === "single" ? ctx.empresa.id : null;
  const userId = session?.user.id ?? "";
  const now = new Date();

  const [rewards, saldo, utilizadosMes, pendentes] = await Promise.all([
    prisma.lojaNordReward.findMany({
      where: {
        active: true,
        OR: [{ disponivelDe: null }, { disponivelDe: { lte: now } }],
      },
      orderBy: { createdAt: "desc" },
    }),
    getSaldoAtual(userId),
    getPontosNoPeriodo(userId, startOfMonth(now), endOfMonth(now), "negativo"),
    getPontosPendentesAprovacao(userId),
  ]);

  return (
    <PageContainer title="Loja Nord" subtitle="Troque seus pontos por produtos e benefícios">
      <LojaNordClient
        initialRewards={rewards.map((r) => ({
          ...r,
          createdAt: r.createdAt.toISOString(),
          updatedAt: r.updatedAt.toISOString(),
          disponivelDe: r.disponivelDe?.toISOString() ?? null,
          disponivelAte: r.disponivelAte?.toISOString() ?? null,
        }))}
        empresaId={empresaId}
        initialSaldo={saldo}
        initialUtilizadosMes={Math.abs(utilizadosMes)}
        initialPendentes={pendentes}
      />
    </PageContainer>
  );
}
