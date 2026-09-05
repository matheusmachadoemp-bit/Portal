import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// TEMPORARY, read-only diagnostic route. Delete after use.
// "Sincronizar histórico completo" falhou de novo mesmo após dividir a
// busca em pedaços de 30 dias. MetaAdsSyncLog.errorMessage guarda a
// mensagem de erro exata da última tentativa — mais confiável que o texto
// genérico que aparece na tela pro usuário.
const FIX_TOKEN = "d4c8f1a6e9b3072d5c9a1e7f3b6d0284a7c1e9f5d2";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (token !== FIX_TOKEN) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const logs = await prisma.metaAdsSyncLog.findMany({
    orderBy: { startedAt: "desc" },
    take: 10,
    select: {
      id: true,
      empresaId: true,
      status: true,
      recordsSynced: true,
      errorMessage: true,
      startedAt: true,
      finishedAt: true,
    },
  });

  return NextResponse.json({ now: new Date().toISOString(), logs });
}
