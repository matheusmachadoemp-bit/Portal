import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateProductionPlan } from "@/lib/producao-plan-server";
import { getStoreManagers, logProductionOrderHistory, notifyProducaoUsers } from "@/lib/producao-server";
import { effectiveProductionStatus } from "@/lib/producao";

/** Disparo agendado (Vercel Cron, ver vercel.json), autenticado via CRON_SECRET.
 * `mode=plan` (madrugada): gera o plano do dia seguinte pra cada loja ativa.
 * `mode=atrasados` (fim de tarde): marca ordens de hoje que passaram do
 * prazo como ATRASADO e notifica responsável + gerentes da loja. */
export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const mode = searchParams.get("mode") ?? "plan";

  const empresas = await prisma.empresa.findMany({ where: { active: true }, select: { id: true } });

  if (mode === "plan") {
    const amanha = new Date();
    amanha.setDate(amanha.getDate() + 1);
    let totalCreated = 0;
    for (const empresa of empresas) {
      const result = await generateProductionPlan(empresa.id, amanha, null);
      totalCreated += result.created;
    }
    return NextResponse.json({ ok: true, mode, empresas: empresas.length, ordensGeradas: totalCreated });
  }

  if (mode === "atrasados") {
    const now = new Date();
    const hojeInicio = new Date(now);
    hojeInicio.setHours(0, 0, 0, 0);
    const hojeFim = new Date(hojeInicio);
    hojeFim.setDate(hojeFim.getDate() + 1);

    const pendentes = await prisma.productionOrder.findMany({
      where: {
        empresaId: { in: empresas.map((e) => e.id) },
        date: { gte: hojeInicio, lt: hojeFim },
        status: { in: ["PENDENTE", "EM_PRODUCAO"] },
        prazo: { lt: now },
      },
      include: { productionItem: { select: { name: true } } },
    });

    let notificados = 0;
    for (const ordem of pendentes) {
      if (effectiveProductionStatus({ prazo: ordem.prazo, status: ordem.status }) !== "ATRASADO") continue;

      await prisma.productionOrder.update({ where: { id: ordem.id }, data: { status: "ATRASADO" } });
      await logProductionOrderHistory(ordem.id, null, "ATRASADO", "Prazo vencido sem finalizar.");

      const managerIds = await getStoreManagers(ordem.empresaId);
      const recipientIds = new Set(managerIds);
      if (ordem.responsavelId) recipientIds.add(ordem.responsavelId);
      await notifyProducaoUsers(
        Array.from(recipientIds),
        "PRODUCAO_ATRASADA",
        `Produção atrasada: ${ordem.productionItem.name}`,
        `Deveria estar pronto até ${new Date(ordem.prazo).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}.`
      );
      notificados++;
    }

    return NextResponse.json({ ok: true, mode, verificadas: pendentes.length, notificados });
  }

  return NextResponse.json({ error: "mode inválido" }, { status: 400 });
}
