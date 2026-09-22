import { prisma } from "@/lib/prisma";
import { PageContainer } from "@/components/page-container";
import { auth } from "@/auth";
import { RankingClient } from "./ranking-client";
import { rankForRange } from "@/lib/loja-nord-server";

export default async function LojaNordRankingPage() {
  const session = await auth();

  // `rankForRange({})` = mesma consulta de antes (soma de pontos > 0 por
  // usuário, sem nenhum outro filtro) — agora reaproveitando o helper
  // compartilhado com a rota de API (`rankForRange`, em
  // src/lib/loja-nord-server.ts), que é cacheado (TTL 60s, achado #293) em
  // vez de duplicar a query aqui sem cache.
  const [ranking, empresas, setoresRaw] = await Promise.all([
    rankForRange({}),
    prisma.empresa.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { order: "asc" } }),
    prisma.lojaNordPointTransaction.findMany({ where: { setor: { not: null } }, select: { setor: true }, distinct: ["setor"] }),
  ]);

  const users = await prisma.user.findMany({
    where: { id: { in: ranking.map((r) => r.userId) } },
    select: { id: true, name: true, avatarUrl: true },
  });
  const userById = new Map(users.map((u) => [u.id, u]));

  const initialRanking = ranking.map((r) => ({
    userId: r.userId,
    nome: userById.get(r.userId)?.name ?? "—",
    avatarUrl: userById.get(r.userId)?.avatarUrl ?? null,
    setor: null as string | null,
    loja: "-",
    pontos: r.pontos,
    posicao: r.posicao,
    tarefas: 0,
    checklists: 0,
    cursos: 0,
    evolucao: null as number | null,
  }));

  const setores = setoresRaw.map((s) => s.setor).filter((s): s is string => !!s);

  return (
    <PageContainer title="Ranking" subtitle="Os colaboradores em destaque na Loja Nord">
      <RankingClient
        initialRanking={initialRanking}
        empresas={empresas}
        setores={setores}
        meuUserId={session?.user.id ?? ""}
      />
    </PageContainer>
  );
}
