import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// TEMPORARY, READ-ONLY diagnostic route to debug why synced Saipos sales
// aren't showing up as SalesEntry rows on the Vendas page. Delete after use.
const DIAG_TOKEN = "d7e320fcac02d20a85f50a232e61ec9de1b6ffe1ad456107";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (token !== DIAG_TOKEN) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const empresas = await prisma.empresa.findMany({
    where: { saiposApiToken: { not: null } },
    select: { id: true, name: true, saiposSyncEnabled: true, saiposLastSyncAt: true },
  });

  const report = [];
  for (const empresa of empresas) {
    const saiposSaleCount = await prisma.saiposSale.count({ where: { empresaId: empresa.id } });
    const latestSaiposSales = await prisma.saiposSale.findMany({
      where: { empresaId: empresa.id },
      orderBy: { shiftDate: "desc" },
      take: 5,
      select: { shiftDate: true, dateTime: true, channel: true, valorTotal: true, saiposId: true },
    });
    const salesEntrySaiposCount = await prisma.salesEntry.count({ where: { empresaId: empresa.id, source: "SAIPOS" } });
    const latestSalesEntries = await prisma.salesEntry.findMany({
      where: { empresaId: empresa.id },
      orderBy: { date: "desc" },
      take: 10,
      select: { date: true, source: true, faturamentoDelivery: true, faturamentoSalao: true, pedidosDelivery: true, pedidosSalao: true, pedidosBalcao: true },
    });
    const latestSyncLog = await prisma.saiposSyncLog.findFirst({
      where: { empresaId: empresa.id },
      orderBy: { startedAt: "desc" },
    });

    report.push({
      empresa: { id: empresa.id, name: empresa.name, saiposSyncEnabled: empresa.saiposSyncEnabled, saiposLastSyncAt: empresa.saiposLastSyncAt },
      saiposSaleCount,
      latestSaiposSales,
      salesEntrySaiposCount,
      latestSalesEntries,
      latestSyncLog,
    });
  }

  return NextResponse.json({ report });
}
