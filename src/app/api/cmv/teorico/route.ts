import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";
import { hasModulePermission } from "@/lib/authz";
import { computeCmvTeorico } from "@/lib/cmv-server";
import { resolveClosedPeriod, type ClosedPeriodMode } from "@/lib/closed-period-filter";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModulePermission(session.user.id, "cmv", "canView"))) {
    return NextResponse.json({ error: "Seu perfil de permissão não permite ver o CMV." }, { status: 403 });
  }

  const ctx = await getActiveEmpresaContext();
  if (!ctx) return NextResponse.json({ error: "Sem acesso a nenhuma loja." }, { status: 403 });
  const metaCmvPercent = ctx.mode === "single" ? ctx.empresa.metaCmvPercent : 30;

  const { searchParams } = new URL(req.url);
  const mode = (searchParams.get("mode") as ClosedPeriodMode) || "mes";
  const key = searchParams.get("key") ?? undefined;

  const periodo = resolveClosedPeriod(mode, key);
  const result = await computeCmvTeorico(empresaIdsForContext(ctx), periodo.from, periodo.to, metaCmvPercent);

  return NextResponse.json({ ...result, from: periodo.from.toISOString(), to: periodo.to.toISOString() });
}
