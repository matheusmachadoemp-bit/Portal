import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// TEMPORARY, READ-ONLY diagnostic route. Delete after use.
const DIAG_TOKEN = "1e54e8b97d2c179a52f5518b5df08577e996495d5ff7e6b7";

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
      select: { id: true, date: true, source: true, faturamentoDelivery: true, faturamentoSalao: true, pedidosDelivery: true, pedidosSalao: true, pedidosBalcao: true },
    });
    const latestSyncLogs = await prisma.saiposSyncLog.findMany({
      where: { empresaId: empresa.id },
      orderBy: { startedAt: "desc" },
      take: 5,
    });

    report.push({
      empresa: { id: empresa.id, name: empresa.name, saiposSyncEnabled: empresa.saiposSyncEnabled, saiposLastSyncAt: empresa.saiposLastSyncAt },
      saiposSaleCount,
      latestSaiposSales,
      salesEntrySaiposCount,
      latestSalesEntries,
      latestSyncLogs,
    });
  }

  return NextResponse.json({ now: new Date().toISOString(), report });
}
