import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { computeDre } from "@/lib/dre";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ctx = await getActiveEmpresaContext();
  if (!ctx) return NextResponse.json({ error: "Sem acesso a nenhuma loja." }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const month = Number(searchParams.get("month")) || new Date().getMonth() + 1;
  const year = Number(searchParams.get("year")) || new Date().getFullYear();

  const rows = await computeDre({ month, year, empresaIds: empresaIdsForContext(ctx) });
  return NextResponse.json({ rows });
}
