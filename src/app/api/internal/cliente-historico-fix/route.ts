import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// TEMPORARY, idempotent schema-fix route. Delete after use.
// Adds the ClienteHistoricoImportado table (migration
// 20260902050000_cliente_historico_importado) if missing — migrations
// aren't applied automatically on deploy in this project.
const FIX_TOKEN = "c4a8e17f2d95b06e3a1c7f4082d9b5e6a3c8f107";

const STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS "ClienteHistoricoImportado" (
     "id" TEXT NOT NULL,
     "empresaId" TEXT NOT NULL,
     "clienteId" TEXT NOT NULL,
     "numeroPedido" TEXT,
     "itens" TEXT,
     "valorGasto" DOUBLE PRECISION,
     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
     CONSTRAINT "ClienteHistoricoImportado_pkey" PRIMARY KEY ("id")
   )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "ClienteHistoricoImportado_clienteId_numeroPedido_key" ON "ClienteHistoricoImportado"("clienteId", "numeroPedido")`,
  `CREATE INDEX IF NOT EXISTS "ClienteHistoricoImportado_empresaId_idx" ON "ClienteHistoricoImportado"("empresaId")`,
  `DO $$ BEGIN
     ALTER TABLE "ClienteHistoricoImportado" ADD CONSTRAINT "ClienteHistoricoImportado_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN
     ALTER TABLE "ClienteHistoricoImportado" ADD CONSTRAINT "ClienteHistoricoImportado_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE CASCADE ON UPDATE CASCADE;
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
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
