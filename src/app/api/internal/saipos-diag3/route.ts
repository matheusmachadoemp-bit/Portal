import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// TEMPORARY, READ-ONLY diagnostic route. Delete after use.
const DIAG_TOKEN = "fcce64b29082cde898127c64187f3012f844f61e8e586968";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (token !== DIAG_TOKEN) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const empresas = await prisma.empresa.findMany({
      where: { saiposApiToken: { not: null } },
      select: { id: true, name: true },
    });

    const report = [];
    for (const empresa of empresas) {
      const saleSaiposCount = await prisma.sale.count({ where: { empresaId: empresa.id, source: "SAIPOS" } });
      const saleManualCount = await prisma.sale.count({ where: { empresaId: empresa.id, source: "MANUAL" } });
      const latestSales = await prisma.sale.findMany({
        where: { empresaId: empresa.id, source: "SAIPOS" },
        orderBy: { dateTime: "desc" },
        take: 5,
        select: { id: true, dateTime: true, channel: true, formaPagamento: true, bairro: true, valorTotal: true, saiposSaleId: true },
      });
      const latestSyncLog = await prisma.saiposSyncLog.findFirst({
        where: { empresaId: empresa.id },
        orderBy: { startedAt: "desc" },
      });

      report.push({
        empresa: { id: empresa.id, name: empresa.name },
        saleSaiposCount,
        saleManualCount,
        latestSales,
        latestSyncLog,
      });
    }

    return NextResponse.json({ now: new Date().toISOString(), report });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
