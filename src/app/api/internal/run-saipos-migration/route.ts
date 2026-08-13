import { NextRequest, NextResponse } from "next/server";
import { Client } from "pg";
import crypto from "crypto";

// TEMPORARY, ONE-OFF ROUTE. DATABASE_URL is a Sensitive env var on Vercel and
// can't be copied from the dashboard, so `prisma migrate deploy` can't be run
// locally either. This route applies the pending "saipos_integration"
// migration using the connection string available at server runtime.
// Delete this file (and the middleware exception) right after a single
// successful call. Same pattern used before in this repo (see git history:
// commits 525d004 / 408694f).
const MIGRATION_TOKEN = "3f236a73c2c8c18e54f9e7411b7482436f360f1ceabf0362";
const MIGRATION_NAME = "20260813150000_saipos_integration";
const MIGRATION_CHECKSUM = "saipos-integration-2026-08-13";

const IDEMPOTENT_ERROR_CODES = new Set([
  "42701", // duplicate_column
  "42P07", // duplicate_table
  "42710", // duplicate_object (constraint/index)
]);

const STATEMENTS = [
  `ALTER TABLE "Empresa" ADD COLUMN IF NOT EXISTS "saiposApiToken" TEXT;`,
  `ALTER TABLE "Empresa" ADD COLUMN IF NOT EXISTS "saiposLojaId" TEXT;`,
  `ALTER TABLE "Empresa" ADD COLUMN IF NOT EXISTS "saiposSyncEnabled" BOOLEAN NOT NULL DEFAULT false;`,
  `ALTER TABLE "Empresa" ADD COLUMN IF NOT EXISTS "saiposLastSyncAt" TIMESTAMP(3);`,
  `CREATE TABLE IF NOT EXISTS "SaiposSale" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "saiposId" TEXT NOT NULL,
    "shiftDate" TIMESTAMP(3) NOT NULL,
    "dateTime" TIMESTAMP(3) NOT NULL,
    "channel" "SaleChannel" NOT NULL DEFAULT 'SALAO',
    "formaPagamento" "PaymentMethod" NOT NULL DEFAULT 'OUTRO',
    "valorTotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "raw" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SaiposSale_pkey" PRIMARY KEY ("id")
  );`,
  `CREATE TABLE IF NOT EXISTS "SaiposSyncLog" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL,
    "recordsSynced" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    CONSTRAINT "SaiposSyncLog_pkey" PRIMARY KEY ("id")
  );`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "SaiposSale_empresaId_saiposId_key" ON "SaiposSale"("empresaId", "saiposId");`,
  `CREATE INDEX IF NOT EXISTS "SaiposSale_empresaId_shiftDate_idx" ON "SaiposSale"("empresaId", "shiftDate");`,
  `CREATE INDEX IF NOT EXISTS "SaiposSyncLog_empresaId_startedAt_idx" ON "SaiposSyncLog"("empresaId", "startedAt");`,
  `ALTER TABLE "SaiposSale" ADD CONSTRAINT "SaiposSale_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;`,
  `ALTER TABLE "SaiposSyncLog" ADD CONSTRAINT "SaiposSyncLog_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;`,
];

async function runMigration(token: string | null) {
  if (token !== MIGRATION_TOKEN) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
        "id" VARCHAR(36) NOT NULL,
        "checksum" VARCHAR(64) NOT NULL,
        "finished_at" TIMESTAMPTZ,
        "migration_name" VARCHAR(255) NOT NULL,
        "logs" TEXT,
        "rolled_back_at" TIMESTAMPTZ,
        "started_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "applied_steps_count" INTEGER NOT NULL DEFAULT 0,
        CONSTRAINT "_prisma_migrations_pkey" PRIMARY KEY ("id")
      );
    `);

    const { rows } = await client.query(
      `SELECT 1 FROM "_prisma_migrations" WHERE migration_name = $1`,
      [MIGRATION_NAME]
    );
    if (rows.length > 0) {
      return NextResponse.json({ ok: true, alreadyApplied: true });
    }

    const applied: string[] = [];
    const skipped: string[] = [];

    for (const sql of STATEMENTS) {
      try {
        await client.query(sql);
        applied.push(sql.slice(0, 60));
      } catch (err) {
        const code = (err as { code?: string }).code;
        if (code && IDEMPOTENT_ERROR_CODES.has(code)) {
          skipped.push(sql.slice(0, 60));
          continue;
        }
        throw err;
      }
    }

    await client.query(
      `INSERT INTO "_prisma_migrations" (id, checksum, finished_at, migration_name, started_at, applied_steps_count)
       VALUES ($1, $2, now(), $3, now(), 1)`,
      [crypto.randomUUID(), MIGRATION_CHECKSUM, MIGRATION_NAME]
    );

    return NextResponse.json({ ok: true, applied, skipped });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  } finally {
    await client.end();
  }
}

export async function POST(req: NextRequest) {
  return runMigration(req.headers.get("x-migration-token"));
}

export async function GET(req: NextRequest) {
  return runMigration(req.nextUrl.searchParams.get("token"));
}
