import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";
import { getManutencaoRelatorioData } from "@/lib/manutencao-server";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ctx = await getActiveEmpresaContext();
  if (!ctx) return NextResponse.json({ error: "Sem acesso a nenhuma loja." }, { status: 403 });
  const empresaIds = empresaIdsForContext(ctx);

  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const setor = searchParams.get("setor");
  const categoria = searchParams.get("categoria");
  const equipamentoId = searchParams.get("equipamentoId");
  const prestadorId = searchParams.get("prestadorId");
  const status = searchParams.get("status");

  const data = await getManutencaoRelatorioData(empresaIds, {
    from: from ? new Date(from) : undefined,
    to: to ? new Date(to) : undefined,
    setor: setor || undefined,
    categoria: categoria || undefined,
    equipamentoId: equipamentoId || undefined,
    prestadorId: prestadorId || undefined,
    status: status || undefined,
  });

  return NextResponse.json(data);
}
