import { NextRequest, NextResponse } from "next/server";
import { Client } from "pg";

// TEMPORARY, ONE-OFF ROUTE. Applies the 6 Prisma migrations that were never
// run against production (the DB was never tracked by Prisma Migrate, so
// `prisma migrate deploy` can't be used directly — see conversation history).
// Delete this file right after a single successful POST call.
const MIGRATION_TOKEN = "8b1a427a92ab9d1eec556ccc734a4e345b578ba453c562b8";

const PENDING_MIGRATIONS: { name: string; checksum: string; sql: string }[] = [
  {
    name: "20260811060000_metas_venda_acumulada",
    checksum: "c41f8a7130ac3cfe72a1d397a51af40bed2987ab488fde6927be94a9674b8f2f",
    sql: `
ALTER TYPE "GoalCategory" ADD VALUE IF NOT EXISTS 'MARKETING';
ALTER TYPE "GoalCategory" ADD VALUE IF NOT EXISTS 'ADMINISTRATIVO';

ALTER TABLE "Employee" ADD COLUMN "photoUrl" TEXT;

CREATE TABLE "WaiterSaleEntry" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WaiterSaleEntry_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "WaiterSaleEntry_employeeId_idx" ON "WaiterSaleEntry"("employeeId");

ALTER TABLE "WaiterSaleEntry" ADD CONSTRAINT "WaiterSaleEntry_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WaiterSaleEntry" ADD CONSTRAINT "WaiterSaleEntry_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WaiterSaleEntry" ADD CONSTRAINT "WaiterSaleEntry_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
`,
  },
  {
    name: "20260811090000_ficha_tecnica_ifood_qualidade",
    checksum: "94cd3812016a4c77fb4e0afe45e6dd7f974e7736059d53ad1f497f22aeaa1231",
    sql: `
ALTER TABLE "Empresa" ADD COLUMN "taxaIfoodPadrao" DOUBLE PRECISION NOT NULL DEFAULT 30;
ALTER TABLE "Product" ADD COLUMN "taxaIfood" DOUBLE PRECISION;
ALTER TABLE "ProductIngredient" ADD COLUMN "order" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "CategoryQualityConfig" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "category" "ProductCategory" NOT NULL,
    "cmvMaximoPercent" DOUBLE PRECISION NOT NULL DEFAULT 35,
    "diasDesatualizada" INTEGER NOT NULL DEFAULT 90,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CategoryQualityConfig_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CategoryQualityConfig_empresaId_category_key" ON "CategoryQualityConfig"("empresaId", "category");

ALTER TABLE "CategoryQualityConfig" ADD CONSTRAINT "CategoryQualityConfig_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
`,
  },
  {
    name: "20260811110000_estoque_movimentacoes",
    checksum: "1695f9827e422aad38470e04c77d541e3280e6b740e526a4b45a0daac032bab0",
    sql: `
ALTER TABLE "Ingredient" ADD COLUMN "validade" TIMESTAMP(3);

CREATE TYPE "StockMovementType" AS ENUM ('ENTRADA', 'SAIDA', 'AJUSTE', 'PERDA', 'TRANSFERENCIA', 'INVENTARIO');

CREATE TABLE "StockMovement" (
    "id" TEXT NOT NULL,
    "ingredientId" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "type" "StockMovementType" NOT NULL,
    "quantidade" DOUBLE PRECISION NOT NULL,
    "estoqueApos" DOUBLE PRECISION NOT NULL,
    "motivo" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StockMovement_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "StockMovement_ingredientId_idx" ON "StockMovement"("ingredientId");

ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "Ingredient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
`,
  },
  {
    name: "20260811130000_permission_profiles",
    checksum: "8053bfd017c659fd9eb6397747b408429080022fcce211c7e12131ec086664cc",
    sql: `
ALTER TABLE "User" ADD COLUMN "permissionProfileId" TEXT;

CREATE TABLE "PermissionProfile" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PermissionProfile_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ModulePermission" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "moduleKey" TEXT NOT NULL,
    "canView" BOOLEAN NOT NULL DEFAULT false,
    "canCreate" BOOLEAN NOT NULL DEFAULT false,
    "canEdit" BOOLEAN NOT NULL DEFAULT false,
    "canDelete" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "ModulePermission_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PermissionProfile_key_key" ON "PermissionProfile"("key");
CREATE UNIQUE INDEX "ModulePermission_profileId_moduleKey_key" ON "ModulePermission"("profileId", "moduleKey");

ALTER TABLE "User" ADD CONSTRAINT "User_permissionProfileId_fkey" FOREIGN KEY ("permissionProfileId") REFERENCES "PermissionProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ModulePermission" ADD CONSTRAINT "ModulePermission_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "PermissionProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
`,
  },
  {
    name: "20260811150000_sale_transactions",
    checksum: "d0bb7a177ad0dbd392f491e24d3f6be9a06539b22bc70ce94ee9f6f045f07488",
    sql: `
ALTER TYPE "PaymentMethod" ADD VALUE IF NOT EXISTS 'VOUCHER';
ALTER TYPE "ProductCategory" ADD VALUE IF NOT EXISTS 'SOBREMESA';

CREATE TYPE "SaleChannel" AS ENUM ('SALAO', 'DELIVERY', 'BALCAO');

CREATE TABLE "Sale" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "dateTime" TIMESTAMP(3) NOT NULL,
    "channel" "SaleChannel" NOT NULL DEFAULT 'SALAO',
    "formaPagamento" "PaymentMethod" NOT NULL DEFAULT 'OUTRO',
    "garcomId" TEXT,
    "mesaNumero" TEXT,
    "bairro" TEXT,
    "regiao" TEXT,
    "valorTotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Sale_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SaleItem" (
    "id" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "productId" TEXT,
    "nome" TEXT NOT NULL,
    "categoria" "ProductCategory",
    "quantidade" DOUBLE PRECISION NOT NULL,
    "precoUnitario" DOUBLE PRECISION NOT NULL,
    "faturamento" DOUBLE PRECISION NOT NULL,
    CONSTRAINT "SaleItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Sale_empresaId_dateTime_idx" ON "Sale"("empresaId", "dateTime");
CREATE INDEX "SaleItem_saleId_idx" ON "SaleItem"("saleId");

ALTER TABLE "Sale" ADD CONSTRAINT "Sale_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_garcomId_fkey" FOREIGN KEY ("garcomId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SaleItem" ADD CONSTRAINT "SaleItem_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SaleItem" ADD CONSTRAINT "SaleItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
`,
  },
  {
    name: "20260811170000_crm_clientes",
    checksum: "b2cfa813ca2e1b50ba258c312c90a35c7f6cedf50bfef303297227ed95513ca2",
    sql: `
ALTER TABLE "Sale" ADD COLUMN "clienteId" TEXT;

CREATE TABLE "Cliente" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "telefone" TEXT,
    "email" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Cliente_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Cliente_empresaId_telefone_key" ON "Cliente"("empresaId", "telefone");

ALTER TABLE "Cliente" ADD CONSTRAINT "Cliente_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE SET NULL ON UPDATE CASCADE;
`,
  },
];

// Migrations already applied to this DB before Prisma Migrate tracking
// existed (tables already present when we inspected the schema).
const BASELINE_ONLY = [
  { name: "20260810151509_init_multiempresa", checksum: "246b70b2c3377a77239aae36c4cb9eb7e6162e8aa2807528eb8876b14556d716" },
  { name: "20260810203505_marketing_module", checksum: "c7b5e888c5f93f70b246782c3c7ce66deaaa16342c8ab0b52cb9efa798c8f3ab" },
  { name: "20260810222805_universidade_grupo_nord", checksum: "31d3052e64c32eacb5f2d2ee2a9728a03d9999be4e540e7865c7a926f5017ce3" },
];

export async function POST(req: NextRequest) {
  const token = req.headers.get("x-migration-token");
  if (token !== MIGRATION_TOKEN) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  try {
    await client.query("BEGIN");

    for (const m of PENDING_MIGRATIONS) {
      await client.query(m.sql);
    }

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

    const allMigrations = [...BASELINE_ONLY, ...PENDING_MIGRATIONS];
    for (const m of allMigrations) {
      await client.query(
        `INSERT INTO "_prisma_migrations" (id, checksum, finished_at, migration_name, started_at, applied_steps_count)
         VALUES ($1, $2, now(), $3, now(), 1)`,
        [crypto.randomUUID(), m.checksum, m.name],
      );
    }

    await client.query("COMMIT");
    return NextResponse.json({ ok: true, applied: PENDING_MIGRATIONS.map((m) => m.name) });
  } catch (err) {
    await client.query("ROLLBACK");
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  } finally {
    await client.end();
  }
}
