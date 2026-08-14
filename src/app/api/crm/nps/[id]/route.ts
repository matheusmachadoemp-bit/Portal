import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const ctx = await getActiveEmpresaContext();
  if (!ctx) return NextResponse.json({ error: "Sem acesso a nenhuma loja." }, { status: 403 });

  const resposta = await prisma.npsResponse.findFirst({ where: { id, empresaId: { in: empresaIdsForContext(ctx) } } });
  if (!resposta) return NextResponse.json({ error: "Resposta não encontrada." }, { status: 404 });

  const body = await req.json();
  const updated = await prisma.npsResponse.update({
    where: { id },
    data: {
      status: body.status ?? undefined,
      responsavelId: body.status === "EM_CONTATO" && !resposta.responsavelId ? session.user.id : undefined,
    },
  });

  return NextResponse.json({ resposta: updated });
}
