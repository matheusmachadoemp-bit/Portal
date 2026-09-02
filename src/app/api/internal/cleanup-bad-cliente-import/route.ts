import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// TEMPORARY fix route. Delete after use.
// The first (and only) uses of CRM > Clientes > Importar clientes for this
// empresa ran hours before the parsing fixes in this same PR set landed —
// during the earlier "fica carregando e não importa" incident, the request
// kept processing in the background after the browser gave up, apparently
// more than once (996 spreadsheet rows produced 1324 Cliente rows and 1990
// ClienteHistoricoImportado rows). All of it used the old buggy parsing
// (numeric cells mis-stringified, addresses left as raw ";"-joined text).
// Confirmed with the user: this empresa had no manually-created clientes
// before that import, so every Cliente row for it is safe to delete
// (ClienteHistoricoImportado cascades) for a clean re-import.
const FIX_TOKEN = "b47a2e9c1f6d3805a9c7e1f2b6d4805c9a7e1f3b6";
const EMPRESA_ID = "cmsndjpe00000497dhfcr8mzd";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (token !== FIX_TOKEN) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const dryRun = req.nextUrl.searchParams.get("confirm") !== "1";

  try {
    if (dryRun) {
      const count = await prisma.cliente.count({ where: { empresaId: EMPRESA_ID } });
      return NextResponse.json({ ok: true, dryRun: true, wouldDelete: count, hint: "adicione &confirm=1 para apagar de verdade" });
    }
    const result = await prisma.cliente.deleteMany({ where: { empresaId: EMPRESA_ID } });
    return NextResponse.json({ ok: true, deleted: result.count });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
