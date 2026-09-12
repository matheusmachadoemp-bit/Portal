import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";
import { hasModulePermission } from "@/lib/authz";
import { loadGarcomRanking } from "@/lib/garcons";
import { resolveRollingPeriod, type RollingPeriodKey } from "@/lib/periods";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModulePermission(session.user.id, "vendas", "canView"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite ver o Vendas." },
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
  const ranking = await loadGarcomRanking(empresaIdsForContext(ctx), range.from, range.to);

  return NextResponse.json({ ranking, from: range.from.toISOString(), to: range.to.toISOString() });
}
