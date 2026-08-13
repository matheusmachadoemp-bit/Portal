import { NextRequest, NextResponse } from "next/server";
import { Client } from "pg";
import crypto from "crypto";

// TEMPORARY, ONE-OFF ROUTE. Same rationale/pattern as run-saipos-migration
// (removed in 9e52332): DATABASE_URL is Sensitive on Vercel, so
// `prisma migrate deploy` can't run locally. Delete this file right after a
// single successful call.
const MIGRATION_TOKEN = "fa2228556cfbaa9e647b793202173cf4606c988673add320";
const MIGRATION_NAME = "20260813151500_sales_entry_saipos_source";
const MIGRATION_CHECKSUM = "sales-entry-saipos-source-2026-08-13";

const IDEMPOTENT_ERROR_CODES = new Set([
  "42701", // duplicate_column
  "42P07", // duplicate_table
  "42710", // duplicate_object (type/constraint/index)
]);

const STATEMENTS = [
  `DO $$ BEGIN
    CREATE TYPE "SalesEntrySource" AS ENUM ('MANUAL', 'SAIPOS');
  EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
  `ALTER TABLE "SalesEntry" ADD COLUMN IF NOT EXISTS "source" "SalesEntrySource" NOT NULL DEFAULT 'MANUAL';`,
  `ALTER TABLE "SalesEntry" ALTER COLUMN "createdById" DROP NOT NULL;`,
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
