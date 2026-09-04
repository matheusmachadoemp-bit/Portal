import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { requireActiveSingleEmpresa } from "@/lib/empresa";
import { syncEmpresaMetaAdsInsights } from "@/lib/meta-ads-sync";

// O histórico completo (36 meses, granularidade diária) busca e grava muito
// mais linhas que a sincronização incremental de 30 dias.
export const maxDuration = 60;

const DEFAULT_SYNC_WINDOW_DAYS = 30;
// A Graph API rejeita ranges de insights maiores que ~37 meses; 36 cobre
// "desde o primeiro dia" com folga para qualquer conta já configurada.
const FULL_HISTORY_MONTHS = 36;

function defaultRange() {
  const end = new Date();
  const start = new Date(end.getTime() - DEFAULT_SYNC_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  return { start, end };
}

function fullHistoryRange() {
  const end = new Date();
  const start = new Date(end);
  start.setMonth(start.getMonth() - FULL_HISTORY_MONTHS);
  return { start, end };
}

/**
 * Disparo manual (botão "Sincronizar agora" nas configurações).
 * Com `?range=all`, busca todo o histórico disponível (até 36 meses) em vez
 * dos últimos 30 dias — usado pelo botão "Sincronizar histórico completo".
 */
export async function POST(req: Request) {
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

  const full = new URL(req.url).searchParams.get("range") === "all";
  const result = await syncEmpresaMetaAdsInsights(empresa, full ? fullHistoryRange() : defaultRange());
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
