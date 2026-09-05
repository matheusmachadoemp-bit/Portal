import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getUserEmpresas } from "@/lib/empresa";
import {
  perfilInicioForRole,
  perfilPodeVerAlertas,
  loadAlertaChecklistAtrasado,
  loadAlertaTarefaVencida,
  loadAlertaMetaAbaixoRitmo,
  loadAlertaEstoqueBaixo,
  loadAlertaAvaliacaoNegativa,
  loadAlertaAprovacaoPendente,
  sortAlertas,
} from "@/lib/inicio";

/**
 * "Alertas importantes" — Proprietário, Gerente e Líder (não Colaborador).
 * Diferente de /api/inicio/indicadores e /api/inicio/desempenho-loja (que
 * usam `perfilPodeVerPainelGerencial`, restrito a Proprietário/Gerente),
 * aqui usamos `perfilPodeVerAlertas`, que também libera o Líder.
 *
 * "Curso obrigatório vencendo" não está incluído: ver comentário acima de
 * `loadAlertaAprovacaoPendente`/seção de alertas em src/lib/inicio.ts para o
 * motivo (não existe campo de prazo/validade em nenhum lugar do módulo de
 * treinamento hoje).
 */
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const perfil = perfilInicioForRole(session.user.role);
  if (!perfilPodeVerAlertas(perfil)) {
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

  const [checklistAtrasado, tarefaVencida, metaAbaixoRitmo, estoqueBaixo, avaliacaoNegativa, aprovacaoPendente] =
    await Promise.all([
      loadAlertaChecklistAtrasado(empresaId, empresa.name),
      loadAlertaTarefaVencida(empresaId, empresa.name),
      loadAlertaMetaAbaixoRitmo(empresaId, empresa.name),
      loadAlertaEstoqueBaixo(empresaId, empresa.name),
      loadAlertaAvaliacaoNegativa(empresaId, empresa.name),
      loadAlertaAprovacaoPendente(empresaId, empresa.name),
    ]);

  const alertas = sortAlertas([
    ...checklistAtrasado,
    ...tarefaVencida,
    ...metaAbaixoRitmo,
    ...estoqueBaixo,
    ...avaliacaoNegativa,
    ...aprovacaoPendente,
  ]);

  return NextResponse.json({ alertas });
}
