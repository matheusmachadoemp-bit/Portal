import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { requireActiveSingleEmpresa } from "@/lib/empresa";
import { syncEmpresaMetaAdsInsights } from "@/lib/meta-ads-sync";

export const maxDuration = 60;

const DEFAULT_SYNC_WINDOW_DAYS = 30;
// Teto de segurança para um `start`/`end` explícito: uma chamada maior que
// isso arrisca estourar tanto o limite de volume de dados da Graph API
// quanto o tempo de execução da função. Para históricos maiores, o
// chamador deve fazer várias chamadas menores em sequência (ver o botão
// "Sincronizar histórico completo" em Configurações, que faz esse loop no
// navegador em pedaços de 30 dias).
const MAX_CUSTOM_RANGE_DAYS = 31;

function defaultRange() {
  const end = new Date();
  const start = new Date(end.getTime() - DEFAULT_SYNC_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  return { start, end };
}

/**
 * Disparo manual (botão "Sincronizar agora" nas configurações).
 * Com `?start=` e `?end=` (datas ISO), sincroniza esse período específico em
 * vez dos últimos 30 dias — usado pelo botão "Sincronizar histórico
 * completo", que chama isso várias vezes em sequência, um mês de cada vez.
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

  const { searchParams } = new URL(req.url);
  const startParam = searchParams.get("start");
  const endParam = searchParams.get("end");

  let range = defaultRange();
  if (startParam && endParam) {
    const start = new Date(startParam);
    const end = new Date(endParam);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) {
      return NextResponse.json({ error: "Período inválido." }, { status: 400 });
    }
    const days = (end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000);
    if (days > MAX_CUSTOM_RANGE_DAYS) {
      return NextResponse.json(
        { error: `Período máximo por chamada é de ${MAX_CUSTOM_RANGE_DAYS} dias.` },
        { status: 400 }
      );
    }
    range = { start, end };
  }

  const result = await syncEmpresaMetaAdsInsights(empresa, range);
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
