import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// TEMPORARY fix route. Delete after use.
// The first real run of CRM > Clientes > Importar clientes hit a parsing bug
// (numeric spreadsheet cells were stringified before Brazilian-format
// parsing, inflating values like 206.40 into ~2e16) — see the fix in
// src/app/api/crm/clientes/import/route.ts. These aggregate-import fields
// (pedidosImportados etc.) didn't exist before this feature and this was
// its first use anywhere in the system, so every Cliente row that has
// pedidosImportados set came from that one bad run. Deletes them
// (ClienteHistoricoImportado cascades) so the file can be re-imported clean.
const FIX_TOKEN = "b47a2e9c1f6d3805a9c7e1f2b6d4805c9a7e1f3b6";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (token !== FIX_TOKEN) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const dryRun = req.nextUrl.searchParams.get("confirm") !== "1";

  try {
    if (dryRun) {
      const affected = await prisma.cliente.groupBy({
        by: ["empresaId"],
        where: { pedidosImportados: { not: null } },
        _count: { _all: true },
      });
      return NextResponse.json({ ok: true, dryRun: true, wouldDelete: affected, hint: "adicione &confirm=1 para apagar de verdade" });
    }
    const result = await prisma.cliente.deleteMany({
      where: { pedidosImportados: { not: null } },
    });
    return NextResponse.json({ ok: true, deleted: result.count });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
