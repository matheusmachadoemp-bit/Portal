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
  loadSerieDiaria7Dias,
} from "@/lib/inicio";

/**
 * Desempenho da loja selecionada (painéis de Proprietário e Gerente) — mesma
 * validação de acesso/perfil de /api/inicio/indicadores.
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

  const empresasPermitidas = await getUserEmpresas(session.user.id, session.user.role);
  const empresa = empresasPermitidas.find((e) => e.id === empresaId);
  if (!empresa) {
    return NextResponse.json({ error: "Loja inválida ou sem permissão." }, { status: 403 });
  }

  const { from, to, prevFrom, prevTo } = resolvePeriodoInicio(searchParams.get("periodo"), {
    inicio: searchParams.get("inicio"),
    fim: searchParams.get("fim"),
  });

  const [atual, anterior, progressoMeta, nps, serieDiaria7Dias] = await Promise.all([
    loadSalesSummary(empresaId, from, to),
    loadSalesSummary(empresaId, prevFrom, prevTo),
    loadProgressoMeta(empresaId),
    loadNpsScore(empresaId, from, to),
    loadSerieDiaria7Dias(empresaId),
  ]);

  return NextResponse.json({
    nomeLoja: empresa.name,
    faturamento: atual.faturamento,
    progressoMeta,
    pedidos: atual.pedidos,
    ticketMedio: atual.ticketMedio,
    nps,
    variacaoPercent: growth(atual.faturamento, anterior.faturamento),
    serieDiaria7Dias,
  });
}
