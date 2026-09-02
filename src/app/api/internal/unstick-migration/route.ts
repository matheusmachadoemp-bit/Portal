import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// TEMPORARY, idempotent fix route. Delete after use.
// Applies the corrected cleanup for the "marketing" category's menu (removes
// the orphaned meta-ads/google-ads/instagram-organico Subcategory rows —
// their pages no longer exist in code, consolidated into trafego-pago and
// redes-sociais) and marks the previously-failed
// 20260902050000_revert_marketing_channels_split migration attempts as
// rolled back, so `prisma migrate deploy` stops blocking on P3009 and picks
// up the now-corrected migration file cleanly on the next deploy.
const FIX_TOKEN = "b6d3f8a1c74e0952a8d6f3c1e9b7402a5c8e1f36d";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (token !== FIX_TOKEN) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const results: { step: string; ok: boolean; error?: string }[] = [];

  try {
    const deleted = await prisma.$executeRawUnsafe(`
      DELETE FROM "Subcategory"
      WHERE "categoryId" = (SELECT "id" FROM "Category" WHERE "key" = 'marketing')
        AND "key" IN ('meta-ads', 'google-ads', 'instagram-organico')
    `);
    results.push({ step: `delete orphaned subcategories (${deleted} row(s))`, ok: true });
  } catch (err) {
    results.push({ step: "delete orphaned subcategories", ok: false, error: String(err) });
  }

  try {
    await prisma.$executeRawUnsafe(`
      UPDATE "Subcategory" SET "name" = 'Tráfego Pago', "icon" = 'TrendingUp'
      WHERE "categoryId" = (SELECT "id" FROM "Category" WHERE "key" = 'marketing') AND "key" = 'trafego-pago'
    `);
    await prisma.$executeRawUnsafe(`
      UPDATE "Subcategory" SET "name" = 'Redes Sociais', "icon" = 'Share2'
      WHERE "categoryId" = (SELECT "id" FROM "Category" WHERE "key" = 'marketing') AND "key" = 'redes-sociais'
    `);
    results.push({ step: "fix trafego-pago/redes-sociais name+icon", ok: true });
  } catch (err) {
    results.push({ step: "fix trafego-pago/redes-sociais name+icon", ok: false, error: String(err) });
  }

  try {
    await prisma.$executeRawUnsafe(`
      UPDATE "Subcategory"
      SET "order" = CASE "key"
        WHEN 'dashboard' THEN 0
        WHEN 'calendario' THEN 1
        WHEN 'tarefas' THEN 2
        WHEN 'campanhas' THEN 3
        WHEN 'parcerias' THEN 4
        WHEN 'biblioteca' THEN 5
        WHEN 'ideias' THEN 6
        WHEN 'trafego-pago' THEN 7
        WHEN 'redes-sociais' THEN 8
        WHEN 'equipe' THEN 9
        WHEN 'relatorios' THEN 10
        ELSE "order"
      END
      WHERE "categoryId" = (SELECT "id" FROM "Category" WHERE "key" = 'marketing')
    `);
    results.push({ step: "fix subcategory order", ok: true });
  } catch (err) {
    results.push({ step: "fix subcategory order", ok: false, error: String(err) });
  }

  try {
    const resolved = await prisma.$executeRawUnsafe(`
      UPDATE "_prisma_migrations"
      SET "rolled_back_at" = now()
      WHERE "migration_name" = '20260902050000_revert_marketing_channels_split'
        AND "finished_at" IS NULL
        AND "rolled_back_at" IS NULL
    `);
    results.push({ step: `mark failed migration rolled back (${resolved} row(s))`, ok: true });
  } catch (err) {
    results.push({ step: "mark failed migration rolled back", ok: false, error: String(err) });
  }

  return NextResponse.json({ results });
}
