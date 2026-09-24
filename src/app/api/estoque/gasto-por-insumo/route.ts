import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";
import { hasModulePermission } from "@/lib/authz";
import { computeGastoPorInsumoRows } from "@/lib/recebimento-server";
import { resolveRollingPeriod, type RollingPeriodKey } from "@/lib/periods";

// Relatório "Gasto por Insumo": quanto foi recebido/pago de cada insumo no período, a partir dos
// recebimentos já confirmados (ver comentário completo em computeGastoPorInsumoRows,
// src/lib/recebimento-server.ts, para as regras de negócio: só compras RECEBIDO/RECEBIDO_PARCIAL,
// filtro pela data do recebimento, fallback para a quantidade pedida quando o recebimento é
// anterior a este relatório existir).
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModulePermission(session.user.id, "estoque", "canView"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite ver o Estoque." },
      { status: 403 }
    );
  }

  const ctx = await getActiveEmpresaContext();
  if (!ctx) return NextResponse.json({ error: "Sem acesso a nenhuma loja." }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const periodo = (searchParams.get("periodo") as RollingPeriodKey) || "mes-atual";
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  const range = resolveRollingPeriod(periodo, { from: from ?? undefined, to: to ?? undefined });
  const rows = await computeGastoPorInsumoRows(empresaIdsForContext(ctx), range.from, range.to);

  return NextResponse.json({ rows, from: range.from.toISOString(), to: range.to.toISOString() });
}
