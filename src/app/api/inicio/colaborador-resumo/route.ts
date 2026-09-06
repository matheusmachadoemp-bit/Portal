import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getUserEmpresas } from "@/lib/empresa";
import { startOfMonth, endOfMonth } from "date-fns";
import { loadRotinaTarefas, countAtividadesConcluidasNoMes } from "@/lib/inicio";
import { getPontosNoPeriodo, rankForRange } from "@/lib/loja-nord-server";

/**
 * Stats do topo da Tela de Início do Colaborador — aberto a QUALQUER perfil
 * logado, mesma regra das demais rotas "individuais" de /api/inicio/* (ex.:
 * /api/inicio/rotina, /api/inicio/loja-nord): cada um só vê os próprios
 * números, na loja pedida.
 *
 * `tarefasHoje` reaproveita `loadRotinaTarefas` (mesma consulta de "tarefas
 * de hoje" já usada por /api/inicio/rotina) e só conta o resultado, em vez
 * de duplicar a query. `pontosNoMes` e `posicaoRanking` reaproveitam
 * `getPontosNoPeriodo`/`rankForRange` de src/lib/loja-nord-server.ts, os
 * mesmos usados por /api/inicio/loja-nord (`ganhosNoMes`/`posicaoRanking`
 * daquela rota) — aqui "posicaoRanking" também é o ranking geral (sem
 * filtro de período) desta loja. Só `atividadesConcluidas` é uma consulta
 * nova (ver `countAtividadesConcluidasNoMes` em src/lib/inicio.ts).
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
  const empresa = empresasPermitidas.find((e) => e.id === empresaId);
  if (!empresa) {
    return NextResponse.json({ error: "Loja inválida ou sem permissão." }, { status: 403 });
  }

  const userId = session.user.id;
  const nomeUsuario = session.user.name ?? "";
  const now = new Date();

  const [tarefas, atividadesConcluidas, pontosNoMes, rankingLoja] = await Promise.all([
    loadRotinaTarefas(empresaId, userId, empresa.name, nomeUsuario, now),
    countAtividadesConcluidasNoMes(empresaId, userId, now),
    getPontosNoPeriodo(userId, startOfMonth(now), endOfMonth(now), "positivo"),
    rankForRange({ empresaId }),
  ]);

  const posicaoRanking = rankingLoja.find((r) => r.userId === userId)?.posicao ?? null;

  return NextResponse.json({
    tarefasHoje: tarefas.length,
    atividadesConcluidas,
    pontosNoMes,
    posicaoRanking,
  });
}
