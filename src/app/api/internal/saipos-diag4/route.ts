import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// TEMPORARY, READ-ONLY diagnostic route. Delete after use.
const DIAG_TOKEN = "db635e5bece1981fea53366a6cb6ade06eb7fa3eccee5858";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (token !== DIAG_TOKEN) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const salao = await prisma.saiposSale.findFirst({
    where: { channel: "SALAO" },
    orderBy: { shiftDate: "desc" },
    select: { raw: true },
  });
  const balcao = await prisma.saiposSale.findFirst({
    where: { channel: "BALCAO" },
    orderBy: { shiftDate: "desc" },
    select: { raw: true },
  });

  const sample = salao?.raw ?? balcao?.raw;
  const rawObj = sample as Record<string, unknown> | null;

  const withItems = await prisma.$queryRaw<{ count: bigint }[]>`
    SELECT COUNT(*)::bigint as count FROM "SaiposSale" WHERE raw ? 'items' AND jsonb_array_length(raw->'items') > 0
  `;

  return NextResponse.json({
    channel: salao ? "SALAO" : balcao ? "BALCAO" : null,
    topLevelKeys: rawObj ? Object.keys(rawObj) : null,
    hasItemsKey: rawObj ? "items" in rawObj : null,
    itemsValue: rawObj?.items ?? null,
    salesWithNonEmptyItems: withItems[0]?.count?.toString() ?? "0",
  });
}
