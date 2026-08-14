import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";
import { getCrmDashboardData } from "@/lib/crm-dashboard";
import type { CrmPeriodKey } from "@/lib/crm";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ctx = await getActiveEmpresaContext();
  if (!ctx) return NextResponse.json({ error: "Sem acesso a nenhuma loja." }, { status: 403 });
  const empresaIds = empresaIdsForContext(ctx);

  const { searchParams } = new URL(req.url);
  const key = (searchParams.get("key") ?? "mes") as CrmPeriodKey;
  const from = searchParams.get("from") ?? undefined;
  const to = searchParams.get("to") ?? undefined;

  const data = await getCrmDashboardData(empresaIds, key, { from, to });
  return NextResponse.json(data);
}
