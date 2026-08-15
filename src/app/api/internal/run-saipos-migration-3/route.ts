import { NextRequest, NextResponse } from "next/server";
import { Client } from "pg";
import crypto from "crypto";

// TEMPORARY, ONE-OFF ROUTE. Same rationale/pattern as previous migration
// routes in this repo's history. Delete after a single successful call.
const MIGRATION_TOKEN = "127184d880012e86e1a0cc217454d4bcf0692231cc317de4";
const MIGRATION_NAME = "20260815020000_sale_saipos_source";
const MIGRATION_CHECKSUM = "sale-saipos-source-2026-08-15";

const IDEMPOTENT_ERROR_CODES = new Set([
  "42701", // duplicate_column
  "42P07", // duplicate_table
  "42710", // duplicate_object
]);

const STATEMENTS = [
  `ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS "source" "SalesEntrySource" NOT NULL DEFAULT 'MANUAL';`,
  `ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS "saiposSaleId" TEXT;`,
  `ALTER TABLE "Sale" ALTER COLUMN "createdById" DROP NOT NULL;`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "Sale_empresaId_saiposSaleId_key" ON "Sale"("empresaId", "saiposSaleId");`,
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
