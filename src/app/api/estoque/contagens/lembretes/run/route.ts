import { NextResponse } from "next/server";
import { isValidCronSecret } from "@/lib/cron-auth";
import { prisma } from "@/lib/prisma";
import { spDateKey } from "@/lib/checklist";
import { generateStockCounts, processStockCountReminders } from "@/lib/estoque-server";

/**
 * Disparo agendado (Vercel Cron nativo, plano Pro, a cada 15 min — ver vercel.json),
 * autenticado via CRON_SECRET — mesmo padrão de /api/checklist/escalations/run e
 * /api/fechamento-dia/alertas/run. Antes do upgrade pro Pro, o cron nativo do Vercel Hobby só
 * permitia 1 execução diária e não garantia disparar num minuto exato, então a cadência real (a
 * cada 15 min) vinha de um workflow redundante no GitHub Actions — removido depois do upgrade,
 * já que o Vercel Cron nativo passou a cobrir a mesma frequência direto.
 *
 * `generateStockCounts` roda ANTES de `processStockCountReminders` — mesma ordem "gera primeiro,
 * notifica depois" de GET /api/checklist/escalations/run (generateChecklistOccurrences antes de
 * processChecklistEscalations). Não precisa de cron próprio: o de Estoque já roda a cada 15 min,
 * e `generateStockCounts` é idempotente (reivindicação atômica `ultimaGeracaoData` + `@@unique([scheduleId,
 * dataContagem])`), então rodar de novo dentro do mesmo dia é seguro e barato.
 */
export async function GET(req: Request) {
  // Comparação timing-safe (ver src/lib/cron-auth.ts) — achado do Jonas, auditoria de
  // segurança 2026-11: comparação de string simples (`===`) é vulnerável a timing attack.
  if (!(await isValidCronSecret(req.headers.get("authorization")))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const empresas = await prisma.empresa.findMany({ where: { active: true }, select: { id: true } });
  const empresaIds = empresas.map((e) => e.id);

  // Falha na geração (já isolada por agenda dentro da função) nunca pode derrubar os lembretes.
  try {
    await generateStockCounts(empresaIds, spDateKey());
  } catch (err) {
    console.error("[estoque] falha ao gerar contagens automáticas:", err);
  }

  const result = await processStockCountReminders();
  return NextResponse.json({ ok: true, ...result });
}
