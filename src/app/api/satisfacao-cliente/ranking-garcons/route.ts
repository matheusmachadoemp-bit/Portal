import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";
import { hasModulePermission } from "@/lib/authz";
import { resolveRollingPeriod, type RollingPeriodKey } from "@/lib/periods";
import { computeRankingGarcons } from "@/lib/customer-survey-ranking";

/**
 * Ranking de Garçons (Fase 5 — backend/dado só; a tela fica pra uma fase seguinte do Caio e o
 * item de menu lateral só entra depois que ela existir, mesmo padrão já seguido pelo resto do
 * módulo — ver comentário do bloco `key: "satisfacao-cliente"` em prisma/seed.ts). 2 rankings
 * (confirmados com o Matheus, sem a métrica de conversão da seção 17 do pedido original — ver
 * comentário completo em src/lib/customer-survey-ranking.ts): quantidade de indicações e NPS.
 *
 * Módulo de permissão "satisfacao-cliente" (não "crm"): Ranking de Garçons é uma das 3
 * subcategorias PENDENTES da categoria "satisfacao-cliente" no menu — só "Visão Geral"/
 * "Avaliações" migraram pra virar subcategoria de "crm" (ver mesmo comentário do seed citado
 * acima). Subcategoria de permissão própria "ranking-garcons", independente da key que a
 * subcategoria de menu vai ganhar quando a tela existir de verdade — mesmo precedente já
 * documentado de "mesas" (key do menu) vs. "mesas-qrcode" (chave usada nos checks de permissão).
 *
 * Período: mesmo padrão "rolling" (`periodo`/`from`/`to` via `resolveRollingPeriod`) já usado por
 * `GET /api/estoque/gasto-por-insumo` e `GET /api/vendas/garcons` — não o `resolveCrmPeriod` (com
 * `prevFrom`/`prevTo`) usado pelo dashboard de Visão Geral deste mesmo módulo, que é outro
 * relatório com necessidade de comparação com o período anterior.
 */
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModulePermission(session.user.id, "satisfacao-cliente", "canView", "ranking-garcons"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite ver o Ranking de Garçons de Satisfação do Cliente." },
      { status: 403 }
    );
  }

  const ctx = await getActiveEmpresaContext();
  if (!ctx) return NextResponse.json({ error: "Sem acesso a nenhuma loja." }, { status: 403 });
  const empresaIds = empresaIdsForContext(ctx);

  const { searchParams } = new URL(req.url);
  const periodo = (searchParams.get("periodo") as RollingPeriodKey) || "mes-atual";
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const range = resolveRollingPeriod(periodo, { from: from ?? undefined, to: to ?? undefined });
  const { porIndicacoes, porNps } = await computeRankingGarcons(empresaIds, range.from, range.to);

  return NextResponse.json({ porIndicacoes, porNps, from: range.from.toISOString(), to: range.to.toISOString() });
}
