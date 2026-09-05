import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getUserEmpresas } from "@/lib/empresa";
import { growth } from "@/lib/calc";
import {
  perfilInicioForRole,
  perfilPodeVerPainelGerencial,
  resolvePeriodoInicio,
  loadSalesSummary,
  loadProgressoMeta,
  loadNpsScore,
  countChecklistsConcluidos,
  countTarefasPendentes,
  countEquipePresenteHoje,
} from "@/lib/inicio";

/**
 * Indicadores da Tela de Início (painéis de Proprietário e Gerente).
 * Painéis de Líder/Colaborador vêm em outra etapa — aqui é 403 pra eles.
 */
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const perfil = perfilInicioForRole(session.user.role);
  if (!perfilPodeVerPainelGerencial(perfil)) {
    return NextResponse.json({ error: "Sem acesso a este painel." }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const empresaId = searchParams.get("empresaId");
  if (!empresaId) {
    return NextResponse.json({ error: "Parâmetro empresaId é obrigatório." }, { status: 400 });
  }

  // Nunca confiar cegamente no empresaId da query string: precisa estar
  // entre as lojas que o usuário logado pode ver (mesma checagem de
  // src/app/api/empresa-context/route.ts).
  const empresasPermitidas = await getUserEmpresas(session.user.id, session.user.role);
  if (!empresasPermitidas.some((e) => e.id === empresaId)) {
    return NextResponse.json({ error: "Loja inválida ou sem permissão." }, { status: 403 });
  }

  const { chave, from, to, prevFrom, prevTo } = resolvePeriodoInicio(searchParams.get("periodo"), {
    inicio: searchParams.get("inicio"),
    fim: searchParams.get("fim"),
  });

  const [atual, anterior, progressoMeta, npsAtual, npsAnterior, checklistsConcluidos, tarefasPendentes, equipePresente] =
    await Promise.all([
      loadSalesSummary(empresaId, from, to),
      loadSalesSummary(empresaId, prevFrom, prevTo),
      loadProgressoMeta(empresaId),
      loadNpsScore(empresaId, from, to),
      loadNpsScore(empresaId, prevFrom, prevTo),
      countChecklistsConcluidos(empresaId, from, to),
      countTarefasPendentes(empresaId),
      countEquipePresenteHoje(empresaId),
    ]);

  return NextResponse.json({
    empresaId,
    periodo: {
      chave,
      from: from.toISOString(),
      to: to.toISOString(),
      prevFrom: prevFrom.toISOString(),
      prevTo: prevTo.toISOString(),
    },
    faturamento: {
      valor: atual.faturamento,
      variacaoPercent: growth(atual.faturamento, anterior.faturamento),
    },
    progressoMeta,
    pedidos: {
      quantidade: atual.pedidos,
      variacaoPercent: growth(atual.pedidos, anterior.pedidos),
    },
    ticketMedio: {
      valor: atual.ticketMedio,
      variacaoPercent: growth(atual.ticketMedio, anterior.ticketMedio),
    },
    checklistsConcluidos: { quantidade: checklistsConcluidos },
    tarefasPendentes: { quantidade: tarefasPendentes },
    equipePresente: { quantidade: equipePresente },
    nps: {
      valor: npsAtual,
      variacaoPercent: growth(npsAtual, npsAnterior),
    },
  });
}
