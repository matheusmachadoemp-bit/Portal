import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";
import { hasModulePermission } from "@/lib/authz";
import { spDateKey, spStartOfDay } from "@/lib/checklist";
import { getFechamentoResumoData } from "@/lib/fechamento-server";

const PERIODO_PADRAO_DIAS = 30;

/**
 * Indicadores agregados do Fechamento do Dia (nota média por loja/cargo, taxa de envio no prazo
 * vs. atrasado, ocorrências por gravidade/categoria e top categorias) — a base de dados pra uma
 * tela futura de relatório (esta rota não constrói nenhuma tela). Nome "indicadores" em vez de
 * "resumo" pra seguir o mesmo padrão já usado por Produção (`GET /api/producao/indicadores`,
 * subcategoria "Indicadores" no menu) em vez de inventar um nome novo pro Portal.
 *
 * Filtro por loja(s): igual toda outra rota do módulo (`status`, `ocorrencias`) — não é um
 * parâmetro de query, vem do contexto de loja ativa da sessão (`getActiveEmpresaContext`), que
 * já resolve tanto o modo "uma loja" quanto o modo "Grupo Nord" (várias lojas de uma vez).
 * Filtro por período: `from`/`to` opcionais ("YYYY-MM-DD"); sem eles, os últimos 30 dias
 * (incluindo hoje).
 */
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!(await hasModulePermission(session.user.id, "fechamento-dia", "canView"))) {
    return NextResponse.json({ error: "Seu perfil de permissão não permite ver o Fechamento do Dia." }, { status: 403 });
  }

  const ctx = await getActiveEmpresaContext();
  if (!ctx) return NextResponse.json({ error: "Sem acesso a nenhuma loja." }, { status: 403 });
  const empresaIds = empresaIdsForContext(ctx);

  const { searchParams } = new URL(req.url);
  const toKey = searchParams.get("to") || spDateKey();
  const fromKeyParam = searchParams.get("from");

  const to = spStartOfDay(toKey);
  const fromKey = fromKeyParam || spDateKey(new Date(to.getTime() - (PERIODO_PADRAO_DIAS - 1) * 24 * 60 * 60 * 1000));
  const from = spStartOfDay(fromKey);

  if (from.getTime() > to.getTime()) {
    return NextResponse.json({ error: '"from" precisa ser anterior ou igual a "to".' }, { status: 400 });
  }

  const data = await getFechamentoResumoData(empresaIds, from, to);

  return NextResponse.json({ from: fromKey, to: toKey, ...data });
}
