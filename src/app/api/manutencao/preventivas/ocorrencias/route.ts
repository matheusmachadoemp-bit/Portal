import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";
import { generateDuePreventivaOcorrencias } from "@/lib/manutencao-server";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ctx = await getActiveEmpresaContext();
  if (!ctx) return NextResponse.json({ error: "Sem acesso a nenhuma loja." }, { status: 403 });
  const empresaIds = empresaIdsForContext(ctx);

  await generateDuePreventivaOcorrencias(empresaIds);

  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const setor = searchParams.get("setor");
  const equipamentoId = searchParams.get("equipamentoId");

  const where: Record<string, unknown> = {
    preventiva: {
      equipamento: {
        empresaId: { in: empresaIds },
        ...(setor ? { setor } : {}),
      },
      ...(equipamentoId ? { equipamentoId } : {}),
    },
  };
  if (from || to) {
    where.dataProgramada = {
      ...(from ? { gte: new Date(from) } : {}),
      ...(to ? { lte: new Date(to) } : {}),
    };
  }

  const ocorrencias = await prisma.manutencaoPreventivaOcorrencia.findMany({
    where,
    orderBy: { dataProgramada: "asc" },
    include: {
      preventiva: {
        include: {
          equipamento: { select: { id: true, nome: true, codigo: true, setor: true, fotoUrl: true, empresa: { select: { name: true, color: true } } } },
          responsavel: { select: { id: true, name: true } },
          prestador: { select: { id: true, nome: true } },
        },
      },
    },
  });

  return NextResponse.json({ ocorrencias });
}
