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
    // Cada loja gera o próprio plano de forma independente — roda em
    // paralelo em vez de uma loja de cada vez.
    const results = await Promise.all(empresas.map((empresa) => generateProductionPlan(empresa.id, amanha, null)));
    const totalCreated = results.reduce((acc, r) => acc + r.created, 0);
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

    const atrasadas = pendentes.filter(
      (ordem) => effectiveProductionStatus({ prazo: ordem.prazo, status: ordem.status }) === "ATRASADO"
    );

    // Uma busca de gerentes por loja distinta (não por ordem) — várias
    // ordens atrasadas costumam ser da mesma loja, mesmo padrão já usado em
    // processChecklistEscalations (src/lib/checklist-server.ts).
    const distinctEmpresaIds = [...new Set(atrasadas.map((o) => o.empresaId))];
    const managersByEmpresa = new Map(
      await Promise.all(distinctEmpresaIds.map(async (empresaId) => [empresaId, await getStoreManagers(empresaId)] as const))
    );

    // Cada ordem atrasada é processada de forma independente das demais.
    await Promise.all(
      atrasadas.map(async (ordem) => {
        await prisma.productionOrder.update({ where: { id: ordem.id }, data: { status: "ATRASADO" } });
        await logProductionOrderHistory(ordem.id, null, "ATRASADO", "Prazo vencido sem finalizar.");

        const managerIds = managersByEmpresa.get(ordem.empresaId) ?? [];
        const recipientIds = new Set(managerIds);
        if (ordem.responsavelId) recipientIds.add(ordem.responsavelId);
        await notifyProducaoUsers(
          Array.from(recipientIds),
          "PRODUCAO_ATRASADA",
          `Produção atrasada: ${ordem.productionItem.name}`,
          `Deveria estar pronto até ${new Date(ordem.prazo).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}.`
        );
      })
    );

    return NextResponse.json({ ok: true, mode, verificadas: pendentes.length, notificados: atrasadas.length });
  }

  return NextResponse.json({ error: "mode inválido" }, { status: 400 });
}
