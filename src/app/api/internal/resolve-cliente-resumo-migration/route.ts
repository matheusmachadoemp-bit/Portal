import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// TEMPORARY, idempotent fix route. Delete after use.
// The 20260902060000_cliente_resumo_importado migration's columns were
// already added manually (via the now-removed /api/internal/cliente-resumo-fix
// route) before "prisma migrate deploy" got to run the migration for real,
// so the real run failed with "column already exists" (P3018/42701) and
// left the migration unresolved, blocking every later migrate deploy the
// same way the marketing-menu one did. Marks it as applied (its effect is
// already live in the DB) instead of rolled back, so the next deploy stops
// retrying it.
const FIX_TOKEN = "9c1f5a3e7d2b48609a7c1e5b3f9d2806a4c7e1f95";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (token !== FIX_TOKEN) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const resolved = await prisma.$executeRawUnsafe(`
      UPDATE "_prisma_migrations"
      SET "finished_at" = now(), "logs" = NULL
      WHERE "migration_name" = '20260902060000_cliente_resumo_importado'
        AND "finished_at" IS NULL
    `);
    return NextResponse.json({ ok: true, resolvedRows: resolved });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
