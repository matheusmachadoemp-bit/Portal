import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getUserEmpresas } from "@/lib/empresa";
import { prisma } from "@/lib/prisma";
import { endOfMonth, startOfMonth } from "date-fns";
import { getPontosNoPeriodo, getSaldoAtual, rankForRange } from "@/lib/loja-nord-server";

/**
 * Card "Loja Nord" da Tela de Início — aberto a QUALQUER perfil logado (todo
 * mundo participa do programa de pontos), diferente das demais rotas de
 * /api/inicio/* desta e das etapas anteriores. Reaproveita as mesmas funções
 * de cálculo de saldo/ranking já usadas por /api/loja-nord/saldo e
 * /api/loja-nord/ranking (`getSaldoAtual`, `getPontosNoPeriodo` e
 * `rankForRange`, todas em src/lib/loja-nord-server.ts) — esta rota só
 * combina o resultado delas no formato do card, sem recalcular nada.
 */
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const empresaId = searchParams.get("empresaId");
  if (!empresaId) {
    return NextResponse.json({ error: "Parâmetro empresaId é obrigatório." }, { status: 400 });
  }

  // Mesma checagem das demais rotas de /api/inicio/*: nunca confiar
  // cegamente no empresaId da query string.
  const empresasPermitidas = await getUserEmpresas(session.user.id, session.user.role);
  if (!empresasPermitidas.some((e) => e.id === empresaId)) {
    return NextResponse.json({ error: "Loja inválida ou sem permissão." }, { status: 403 });
  }

  const userId = session.user.id;
  const now = new Date();

  const [saldo, ganhosNoMes, rankingLoja] = await Promise.all([
    getSaldoAtual(userId),
    getPontosNoPeriodo(userId, startOfMonth(now), endOfMonth(now), "positivo"),
    // Ranking "geral" (sem recorte de período) filtrado pela loja pedida —
    // mesmo parâmetro `empresaId` que /api/loja-nord/ranking/route.ts já
    // aceita para restringir o ranking a uma única loja.
    rankForRange({ empresaId }),
  ]);

  const minhaPosicao = rankingLoja.find((r) => r.userId === userId)?.posicao ?? null;

  const top3 = rankingLoja.slice(0, 3);
  const usersTop3 = await prisma.user.findMany({
    where: { id: { in: top3.map((r) => r.userId) } },
    select: { id: true, name: true },
  });
  const nomeById = new Map(usersTop3.map((u) => [u.id, u.name]));
  const top3Loja = top3.map((r) => ({ nome: nomeById.get(r.userId) ?? "—", pontos: r.pontos }));

  // "Próxima recompensa": não existia essa noção pronta em nenhum lugar do
  // módulo Loja Nord — construída especificamente para este card. Critério:
  // primeiro brinde do catálogo (ordenado por custo em pontos, crescente)
  // que o colaborador ainda não teria saldo suficiente para resgatar, entre
  // os brindes que ele realmente poderia resgatar agora — mesmas condições
  // de elegibilidade usadas por `criarResgate`/pelo catálogo em
  // /api/loja-nord/rewards (ativo, dentro da janela de disponibilidade, com
  // estoque e liberado para esta loja). Sem brinde elegível mais caro que o
  // saldo atual (catálogo vazio para esta loja, ou saldo já cobre tudo que
  // está disponível): retorna null em vez de inventar uma recompensa.
  const catalogo = await prisma.lojaNordReward.findMany({
    where: { active: true },
    orderBy: { pontos: "asc" },
  });
  const elegiveis = catalogo.filter((r) => {
    if (r.empresaIds.length > 0 && !r.empresaIds.includes(empresaId)) return false;
    if (r.disponivelDe && now < r.disponivelDe) return false;
    if (r.disponivelAte && now > r.disponivelAte) return false;
    if (r.estoque !== null && r.estoque <= 0) return false;
    return true;
  });
  const proxima = elegiveis.find((r) => r.pontos > saldo) ?? null;

  return NextResponse.json({
    saldo,
    ganhosNoMes,
    posicaoRanking: minhaPosicao,
    proximaRecompensa: proxima ? { nome: proxima.nome, pontosNecessarios: proxima.pontos } : null,
    progressoProximaRecompensa: proxima ? Math.min(100, Math.max(0, (saldo / proxima.pontos) * 100)) : null,
    top3Loja,
  });
}
