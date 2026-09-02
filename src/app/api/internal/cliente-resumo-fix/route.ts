import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// TEMPORARY, idempotent schema-fix route. Delete after use.
// Adds the Cliente aggregate-import columns (migration
// 20260902060000_cliente_resumo_importado) if missing — migrations aren't
// applied automatically on deploy in this project.
const FIX_TOKEN = "e91b4c6a3f7d05e8b2a9c4f716d3805a9c2e7f04b";

const STATEMENTS = [
  `ALTER TABLE "Cliente" ADD COLUMN IF NOT EXISTS "pedidosImportados" INTEGER`,
  `ALTER TABLE "Cliente" ADD COLUMN IF NOT EXISTS "valorGastoImportado" DOUBLE PRECISION`,
  `ALTER TABLE "Cliente" ADD COLUMN IF NOT EXISTS "ticketMedioImportado" DOUBLE PRECISION`,
  `ALTER TABLE "Cliente" ADD COLUMN IF NOT EXISTS "ultimaCompraImportada" TIMESTAMP(3)`,
];

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (token !== FIX_TOKEN) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const results: { step: string; ok: boolean; error?: string }[] = [];
  for (const sql of STATEMENTS) {
    try {
      await prisma.$executeRawUnsafe(sql);
      results.push({ step: sql.slice(0, 60), ok: true });
    } catch (err) {
      results.push({ step: sql.slice(0, 60), ok: false, error: String(err) });
    }
  }

  return NextResponse.json({ results });
}
