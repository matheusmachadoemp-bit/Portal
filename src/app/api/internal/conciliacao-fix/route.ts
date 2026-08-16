import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// TEMPORARY, idempotent schema-fix route. Delete after use.
// Adds the BankTransaction/BankReconciliationImport tables (migration
// 20260815130000_bank_reconciliation) if missing, and re-creates the
// "Conciliação Bancária" sidebar entry (Category/Subcategory), which
// was only ever added via prisma/seed.ts — a script that never runs
// automatically in production.
const FIX_TOKEN = "b7e2d94a1c6f30875b9e2d1a4c7f603985a1e7c2f90b4d63";

const SQL_STATEMENTS = [
  `DO $$ BEGIN
     CREATE TYPE "BankTransactionDirection" AS ENUM ('ENTRADA', 'SAIDA');
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN
     CREATE TYPE "BankTransactionStatus" AS ENUM ('PENDENTE', 'CONCILIADO', 'IGNORADO');
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `CREATE TABLE IF NOT EXISTS "BankReconciliationImport" (
     "id" TEXT NOT NULL,
     "empresaId" TEXT NOT NULL,
     "bankAccountId" TEXT NOT NULL,
     "fileName" TEXT NOT NULL,
     "totalEntradas" DOUBLE PRECISION NOT NULL DEFAULT 0,
     "totalSaidas" DOUBLE PRECISION NOT NULL DEFAULT 0,
     "totalLinhas" INTEGER NOT NULL DEFAULT 0,
     "createdById" TEXT NOT NULL,
     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
     CONSTRAINT "BankReconciliationImport_pkey" PRIMARY KEY ("id")
   )`,
  `CREATE TABLE IF NOT EXISTS "BankTransaction" (
     "id" TEXT NOT NULL,
     "empresaId" TEXT NOT NULL,
     "bankAccountId" TEXT NOT NULL,
     "importId" TEXT NOT NULL,
     "date" TIMESTAMP(3) NOT NULL,
     "descricao" TEXT NOT NULL,
     "direction" "BankTransactionDirection" NOT NULL,
     "valor" DOUBLE PRECISION NOT NULL,
     "status" "BankTransactionStatus" NOT NULL DEFAULT 'PENDENTE',
     "observacoes" TEXT,
     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
     "updatedAt" TIMESTAMP(3) NOT NULL,
     CONSTRAINT "BankTransaction_pkey" PRIMARY KEY ("id")
   )`,
  `CREATE INDEX IF NOT EXISTS "BankReconciliationImport_empresaId_bankAccountId_idx" ON "BankReconciliationImport"("empresaId", "bankAccountId")`,
  `CREATE INDEX IF NOT EXISTS "BankTransaction_empresaId_bankAccountId_date_idx" ON "BankTransaction"("empresaId", "bankAccountId", "date")`,
  `CREATE INDEX IF NOT EXISTS "BankTransaction_importId_idx" ON "BankTransaction"("importId")`,
  `DO $$ BEGIN
     ALTER TABLE "BankReconciliationImport" ADD CONSTRAINT "BankReconciliationImport_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN
     ALTER TABLE "BankReconciliationImport" ADD CONSTRAINT "BankReconciliationImport_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN
     ALTER TABLE "BankReconciliationImport" ADD CONSTRAINT "BankReconciliationImport_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN
     ALTER TABLE "BankTransaction" ADD CONSTRAINT "BankTransaction_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN
     ALTER TABLE "BankTransaction" ADD CONSTRAINT "BankTransaction_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN
     ALTER TABLE "BankTransaction" ADD CONSTRAINT "BankTransaction_importId_fkey" FOREIGN KEY ("importId") REFERENCES "BankReconciliationImport"("id") ON DELETE CASCADE ON UPDATE CASCADE;
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
];

// Matches the "financeiro" category's `subs` list in prisma/seed.ts exactly,
// so re-running this keeps the sidebar order identical to what a fresh seed
// would produce.
const FINANCEIRO_SUBS = [
  { key: "dashboard", name: "Dashboard Financeiro", icon: "LayoutDashboard" },
  { key: "contas-a-pagar", name: "Contas a Pagar", icon: "ArrowUpCircle" },
  { key: "contas-a-receber", name: "Contas a Receber", icon: "ArrowDownCircle" },
  { key: "fluxo-de-caixa", name: "Fluxo de Caixa", icon: "Waves" },
  { key: "caixa-da-empresa", name: "Caixa da Empresa", icon: "Vault" },
  { key: "dre", name: "DRE", icon: "FileBarChart" },
  { key: "categorias-financeiras", name: "Categorias Financeiras", icon: "Tags" },
  { key: "contas-bancarias", name: "Contas Bancárias", icon: "Landmark" },
  { key: "conciliacao-bancaria", name: "Conciliação Bancária", icon: "ListChecks" },
  { key: "relatorios", name: "Relatórios", icon: "FileSpreadsheet" },
];

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (token !== FIX_TOKEN) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const results: { step: string; ok: boolean; error?: string }[] = [];

  for (const sql of SQL_STATEMENTS) {
    try {
      await prisma.$executeRawUnsafe(sql);
      results.push({ step: sql.slice(0, 60), ok: true });
    } catch (err) {
      results.push({ step: sql.slice(0, 60), ok: false, error: String(err) });
    }
  }

  try {
    const category = await prisma.category.findUnique({ where: { key: "financeiro" } });
    if (!category) {
      results.push({ step: "category financeiro", ok: false, error: "categoria financeiro não encontrada" });
    } else {
      let subOrder = 0;
      for (const sub of FINANCEIRO_SUBS) {
        await prisma.subcategory.upsert({
          where: { categoryId_key: { categoryId: category.id, key: sub.key } },
          update: { name: sub.name, icon: sub.icon, order: subOrder },
          create: {
            categoryId: category.id,
            key: sub.key,
            name: sub.name,
            icon: sub.icon,
            order: subOrder,
            isSystem: true,
          },
        });
        subOrder++;
      }
      results.push({ step: "subcategorias financeiro (upsert)", ok: true });
    }
  } catch (err) {
    results.push({ step: "subcategorias financeiro", ok: false, error: String(err) });
  }

  return NextResponse.json({ results });
}
