import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { requireActiveSingleEmpresa } from "@/lib/empresa";
import { syncEmpresaMetaAdsInsights } from "@/lib/meta-ads-sync";

const DEFAULT_SYNC_WINDOW_DAYS = 30;

function defaultRange() {
  const end = new Date();
  const start = new Date(end.getTime() - DEFAULT_SYNC_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  return { start, end };
}

/** Disparo manual (botão "Sincronizar agora" nas configurações). */
export async function POST() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "ADMINISTRADOR" && session.user.role !== "GESTOR") {
    return NextResponse.json({ error: "Sem permissão para sincronizar." }, { status: 403 });
  }

  const empresa = await requireActiveSingleEmpresa();
  if (!empresa) {
    return NextResponse.json(
      { error: "Selecione uma loja específica (não é possível sincronizar no modo Grupo Nord)." },
      { status: 400 }
    );
  }

  const result = await syncEmpresaMetaAdsInsights(empresa, defaultRange());
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 502 });
  return NextResponse.json({ recordsSynced: result.recordsSynced });
}

/** Disparo agendado (Vercel Cron, ver vercel.json), autenticado via CRON_SECRET. */
export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const empresas = await prisma.empresa.findMany({
    where: { active: true, metaAdsSyncEnabled: true, metaAdsAccessToken: { not: null }, metaAdsAdAccountId: { not: null } },
    select: {
      id: true,
      metaAdsAccessToken: true,
      metaAdsAdAccountId: true,
      metaAdsGraphVersion: true,
      metaAdsInstagramAccountId: true,
    },
  });

  const range = defaultRange();
  const results = await Promise.all(
    empresas.map(async (empresa) => ({
      empresaId: empresa.id,
      result: await syncEmpresaMetaAdsInsights(empresa, range),
    }))
  );

  return NextResponse.json({ synced: results.length, results });
}
