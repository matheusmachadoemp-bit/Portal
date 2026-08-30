import { NextRequest, NextResponse } from "next/server";
import { Client } from "pg";
import crypto from "crypto";

// TEMPORARY, ONE-OFF ROUTE. Resolves a P3018-blocked migration state in
// production: a previous ad-hoc migration route already applied part of
// this schema change under a different (unrecorded) migration name, so
// the real "20260830060000_sale_saipos_backfill" migration collided on
// "source" already existing and got stuck as failed in _prisma_migrations,
// blocking all future `prisma migrate deploy` runs (P3018). This route
// clears that failed record, (re)applies the now-idempotent statements,
// and records a clean success row with the exact checksum Prisma expects.
// Delete this route after a single successful call. Uses MIGRATION_FIX_TOKEN
// (a plain-text env var the user adds temporarily to Preview+Production)
// as the access token, instead of hardcoding a new secret in the repo.
const MIGRATION_NAME = "20260830060000_sale_saipos_backfill";
const MIGRATION_CHECKSUM = "ac0875717a7e15b78595bf3e1b02e27a0ce7e7f1e0f73babb1ab2ace129e072b";

const STATEMENTS = [
  `ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS "source" "SalesEntrySource" NOT NULL DEFAULT 'MANUAL';`,
  `ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS "saiposSaleId" TEXT;`,
  `ALTER TABLE "Sale" ALTER COLUMN "createdById" DROP NOT NULL;`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "Sale_empresaId_saiposSaleId_key" ON "Sale"("empresaId", "saiposSaleId");`,
];

async function run(token: string | null) {
  if (!process.env.MIGRATION_FIX_TOKEN || token !== process.env.MIGRATION_FIX_TOKEN) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  try {
    const before = await client.query(
      `SELECT migration_name, started_at, finished_at, rolled_back_at FROM "_prisma_migrations" WHERE migration_name = $1`,
      [MIGRATION_NAME]
    );

    await client.query(`DELETE FROM "_prisma_migrations" WHERE migration_name = $1`, [MIGRATION_NAME]);

    const applied: string[] = [];
    for (const sql of STATEMENTS) {
      await client.query(sql);
      applied.push(sql.slice(0, 60));
    }

    await client.query(
      `INSERT INTO "_prisma_migrations" (id, checksum, finished_at, migration_name, started_at, applied_steps_count)
       VALUES ($1, $2, now(), $3, now(), $4)`,
      [crypto.randomUUID(), MIGRATION_CHECKSUM, MIGRATION_NAME, STATEMENTS.length]
    );

    const columns = await client.query(
      `SELECT column_name, is_nullable FROM information_schema.columns WHERE table_name = 'Sale' AND column_name IN ('source','saiposSaleId','createdById')`
    );

    return NextResponse.json({ ok: true, previousRow: before.rows[0] ?? null, applied, saleColumns: columns.rows });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  } finally {
    await client.end();
  }
}

export async function POST(req: NextRequest) {
  return run(req.headers.get("x-migration-token"));
}

export async function GET(req: NextRequest) {
  return run(req.nextUrl.searchParams.get("token"));
}
