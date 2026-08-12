import { NextRequest, NextResponse } from "next/server";
import { Client } from "pg";

// TEMPORARY, ONE-OFF ROUTE. Applies the Prisma migrations that were never
// run against production because migrate deploy can't run in the Vercel
// build step for this project (see git history: commits 40039f6 / f56d0fc).
// Delete this file right after a single successful call.
const MIGRATION_TOKEN = "2f03aa2459d56e99ffbafb005495671fe0f555beccf926ce";

const PENDING_MIGRATIONS: { name: string; checksum: string; sql: string }[] = [
  {
    name: "20260811193000_rh_module_expansion",
    checksum: "8ff94dc3cf9d67e22f0aea213b54f476aed73d7f7f4f507b55b34345b36c972c",
    sql: `
-- AlterEnum
ALTER TYPE "OccurrenceType" ADD VALUE 'ADVERTENCIA';

-- AlterEnum
ALTER TYPE "OccurrenceType" ADD VALUE 'SUSPENSAO';

-- AlterEnum
ALTER TYPE "OccurrenceType" ADD VALUE 'ELOGIO';

-- AlterEnum
ALTER TYPE "OccurrenceType" ADD VALUE 'ACIDENTE';

-- AlterEnum
ALTER TYPE "OccurrenceType" ADD VALUE 'RECLAMACAO';

-- AlterEnum
ALTER TYPE "OccurrenceType" ADD VALUE 'CONFLITO_INTERNO';

-- AlterEnum
ALTER TYPE "OccurrenceType" ADD VALUE 'FEEDBACK';

-- CreateEnum
CREATE TYPE "RhFinanceType" AS ENUM ('SALARIO', 'COMISSAO', 'BONIFICACAO', 'DESCONTO', 'VALE_TRANSPORTE', 'VALE_ALIMENTACAO', 'OUTRO');

-- CreateEnum
CREATE TYPE "VacationStatus" AS ENUM ('PLANEJADA', 'APROVADA', 'EM_ANDAMENTO', 'CONCLUIDA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "UniformItemType" AS ENUM ('CAMISA', 'CALCA', 'AVENTAL', 'BONE', 'TOUCA', 'SAPATO', 'CINTO', 'OUTRO');

-- CreateEnum
CREATE TYPE "UniformStatus" AS ENUM ('ENTREGUE', 'TROCADO', 'DEVOLVIDO', 'PERDIDO');

-- CreateEnum
CREATE TYPE "DocumentCategory" AS ENUM ('RG', 'CPF', 'CTPS', 'COMPROVANTE_RESIDENCIA', 'TITULO_ELEITOR', 'RESERVISTA', 'EXAME_ADMISSIONAL', 'ASO', 'CNH', 'CONTRATO', 'TERMO', 'CERTIFICADO', 'TREINAMENTO', 'OUTRO');

-- AlterTable
ALTER TABLE "Employee" ADD COLUMN     "cpf" TEXT,
ADD COLUMN     "birthDate" TIMESTAMP(3),
ADD COLUMN     "escala" TEXT,
ADD COLUMN     "supervisorResponsavel" TEXT,
ADD COLUMN     "salarioFixo" DOUBLE PRECISION,
ADD COLUMN     "lastEvaluationDate" TIMESTAMP(3),
ADD COLUMN     "lastEvaluationNote" TEXT,
ADD COLUMN     "lastTrainingDate" TIMESTAMP(3),
ADD COLUMN     "lastTrainingName" TEXT;

-- AlterTable
ALTER TABLE "Occurrence" ADD COLUMN     "medidasTomadas" TEXT,
ADD COLUMN     "prazo" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "EmployeeFinanceEntry" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "description" TEXT NOT NULL,
    "type" "RhFinanceType" NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "observacao" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmployeeFinanceEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TimeEntry" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "entrada" TEXT,
    "saidaAlmoco" TEXT,
    "retornoAlmoco" TEXT,
    "saida" TEXT,
    "horasTrabalhadas" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "atrasoMinutos" INTEGER NOT NULL DEFAULT 0,
    "falta" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TimeEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vacation" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "periodoAquisitivoInicio" TIMESTAMP(3) NOT NULL,
    "periodoAquisitivoFim" TIMESTAMP(3) NOT NULL,
    "diasDireito" INTEGER NOT NULL DEFAULT 30,
    "dataInicio" TIMESTAMP(3),
    "dataFim" TIMESTAMP(3),
    "dias" INTEGER,
    "status" "VacationStatus" NOT NULL DEFAULT 'PLANEJADA',
    "observacao" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Vacation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UniformDelivery" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "item" "UniformItemType" NOT NULL,
    "quantidade" INTEGER NOT NULL DEFAULT 1,
    "tamanho" TEXT,
    "dataEntrega" TIMESTAMP(3) NOT NULL,
    "responsavel" TEXT,
    "status" "UniformStatus" NOT NULL DEFAULT 'ENTREGUE',
    "observacao" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UniformDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeDocument" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "categoria" "DocumentCategory" NOT NULL,
    "nome" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "mimeType" TEXT,
    "validade" TIMESTAMP(3),
    "observacao" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmployeeDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EmployeeFinanceEntry_employeeId_idx" ON "EmployeeFinanceEntry"("employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "TimeEntry_employeeId_date_key" ON "TimeEntry"("employeeId", "date");

-- CreateIndex
CREATE INDEX "Vacation_employeeId_idx" ON "Vacation"("employeeId");

-- CreateIndex
CREATE INDEX "UniformDelivery_employeeId_idx" ON "UniformDelivery"("employeeId");

-- CreateIndex
CREATE INDEX "EmployeeDocument_employeeId_idx" ON "EmployeeDocument"("employeeId");

-- AddForeignKey
ALTER TABLE "EmployeeFinanceEntry" ADD CONSTRAINT "EmployeeFinanceEntry_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeFinanceEntry" ADD CONSTRAINT "EmployeeFinanceEntry_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeFinanceEntry" ADD CONSTRAINT "EmployeeFinanceEntry_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeEntry" ADD CONSTRAINT "TimeEntry_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeEntry" ADD CONSTRAINT "TimeEntry_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vacation" ADD CONSTRAINT "Vacation_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vacation" ADD CONSTRAINT "Vacation_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vacation" ADD CONSTRAINT "Vacation_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UniformDelivery" ADD CONSTRAINT "UniformDelivery_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UniformDelivery" ADD CONSTRAINT "UniformDelivery_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UniformDelivery" ADD CONSTRAINT "UniformDelivery_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeDocument" ADD CONSTRAINT "EmployeeDocument_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeDocument" ADD CONSTRAINT "EmployeeDocument_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeDocument" ADD CONSTRAINT "EmployeeDocument_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
`,
  },
  {
    name: "20260812120000_crm_module",
    checksum: "c098a5a82377e5c395536cdeff9c94d16663e8de1e98a45c0fd66d38ab1c4a1c",
    sql: `
-- CreateEnum
CREATE TYPE "CampaignAudienceType" AS ENUM ('TODOS', 'SEGMENTO', 'CLIENTES');

-- CreateEnum
CREATE TYPE "CampaignChannel" AS ENUM ('WHATSAPP', 'SMS', 'EMAIL', 'PUSH');

-- CreateEnum
CREATE TYPE "CampaignOfferType" AS ENUM ('CUPOM', 'DESCONTO_PERCENTUAL', 'DESCONTO_VALOR', 'PRODUTO_GRATIS', 'CASHBACK', 'PONTOS', 'SEM_OFERTA');

-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('RASCUNHO', 'AGENDADA', 'ENVIADA', 'CONCLUIDA');

-- CreateEnum
CREATE TYPE "CampaignRecipientStatus" AS ENUM ('PENDENTE', 'ENVIADO', 'ENTREGUE', 'VISUALIZADO', 'CLICOU', 'CONVERTEU');

-- CreateEnum
CREATE TYPE "AutomationTrigger" AS ENUM ('PRIMEIRA_COMPRA', 'SEGUNDA_COMPRA', 'INATIVO_30', 'INATIVO_60', 'INATIVO_90', 'ANIVERSARIO', 'CLIENTE_VIP', 'POS_VENDA', 'AVALIACAO', 'RECUPERACAO');

-- CreateEnum
CREATE TYPE "AutomationActionType" AS ENUM ('MENSAGEM', 'TAG', 'OFERTA');

-- CreateEnum
CREATE TYPE "LoyaltyTransactionType" AS ENUM ('GANHO', 'RESGATE');

-- CreateEnum
CREATE TYPE "NpsStatus" AS ENUM ('PENDENTE', 'EM_CONTATO', 'RESOLVIDO');

-- AlterTable
ALTER TABLE "Cliente" ADD COLUMN     "bairro" TEXT,
ADD COLUMN     "canalPreferido" "SaleChannel",
ADD COLUMN     "cidade" TEXT,
ADD COLUMN     "dataNascimento" TIMESTAMP(3),
ADD COLUMN     "endereco" TEXT,
ADD COLUMN     "whatsapp" TEXT;

-- CreateTable
CREATE TABLE "CustomerNote" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmSegment" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "criteria" JSONB NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmSegment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Campaign" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "CampaignStatus" NOT NULL DEFAULT 'RASCUNHO',
    "audienceType" "CampaignAudienceType" NOT NULL DEFAULT 'TODOS',
    "segmentId" TEXT,
    "channel" "CampaignChannel" NOT NULL DEFAULT 'WHATSAPP',
    "offerType" "CampaignOfferType" NOT NULL DEFAULT 'SEM_OFERTA',
    "offerValue" DOUBLE PRECISION,
    "offerDescription" TEXT,
    "message" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignRecipient" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "status" "CampaignRecipientStatus" NOT NULL DEFAULT 'PENDENTE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CampaignRecipient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Automation" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "trigger" "AutomationTrigger" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "waitDays" INTEGER NOT NULL DEFAULT 0,
    "actionType" "AutomationActionType" NOT NULL DEFAULT 'MENSAGEM',
    "message" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Automation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoyaltyConfig" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "pontosPorReal" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LoyaltyConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoyaltyReward" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "pontosNecessarios" INTEGER NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoyaltyReward_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoyaltyAccount" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "pontos" INTEGER NOT NULL DEFAULT 0,
    "cashback" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LoyaltyAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoyaltyTransaction" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "tipo" "LoyaltyTransactionType" NOT NULL,
    "pontos" INTEGER NOT NULL DEFAULT 0,
    "cashback" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "descricao" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoyaltyTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NpsResponse" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "clienteId" TEXT,
    "saleId" TEXT,
    "nota" INTEGER NOT NULL,
    "comentario" TEXT,
    "status" "NpsStatus" NOT NULL DEFAULT 'PENDENTE',
    "responsavelId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NpsResponse_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CustomerNote_clienteId_idx" ON "CustomerNote"("clienteId");

-- CreateIndex
CREATE INDEX "CrmSegment_empresaId_idx" ON "CrmSegment"("empresaId");

-- CreateIndex
CREATE INDEX "Campaign_empresaId_status_idx" ON "Campaign"("empresaId", "status");

-- CreateIndex
CREATE INDEX "CampaignRecipient_campaignId_idx" ON "CampaignRecipient"("campaignId");

-- CreateIndex
CREATE UNIQUE INDEX "CampaignRecipient_campaignId_clienteId_key" ON "CampaignRecipient"("campaignId", "clienteId");

-- CreateIndex
CREATE INDEX "Automation_empresaId_idx" ON "Automation"("empresaId");

-- CreateIndex
CREATE UNIQUE INDEX "LoyaltyConfig_empresaId_key" ON "LoyaltyConfig"("empresaId");

-- CreateIndex
CREATE INDEX "LoyaltyReward_empresaId_idx" ON "LoyaltyReward"("empresaId");

-- CreateIndex
CREATE UNIQUE INDEX "LoyaltyAccount_clienteId_key" ON "LoyaltyAccount"("clienteId");

-- CreateIndex
CREATE INDEX "LoyaltyAccount_empresaId_idx" ON "LoyaltyAccount"("empresaId");

-- CreateIndex
CREATE INDEX "LoyaltyTransaction_accountId_idx" ON "LoyaltyTransaction"("accountId");

-- CreateIndex
CREATE INDEX "NpsResponse_empresaId_createdAt_idx" ON "NpsResponse"("empresaId", "createdAt");

-- CreateIndex
CREATE INDEX "Cliente_empresaId_dataNascimento_idx" ON "Cliente"("empresaId", "dataNascimento");

-- AddForeignKey
ALTER TABLE "CustomerNote" ADD CONSTRAINT "CustomerNote_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerNote" ADD CONSTRAINT "CustomerNote_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerNote" ADD CONSTRAINT "CustomerNote_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmSegment" ADD CONSTRAINT "CrmSegment_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmSegment" ADD CONSTRAINT "CrmSegment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_segmentId_fkey" FOREIGN KEY ("segmentId") REFERENCES "CrmSegment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignRecipient" ADD CONSTRAINT "CampaignRecipient_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignRecipient" ADD CONSTRAINT "CampaignRecipient_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Automation" ADD CONSTRAINT "Automation_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Automation" ADD CONSTRAINT "Automation_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoyaltyConfig" ADD CONSTRAINT "LoyaltyConfig_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoyaltyReward" ADD CONSTRAINT "LoyaltyReward_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoyaltyAccount" ADD CONSTRAINT "LoyaltyAccount_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoyaltyAccount" ADD CONSTRAINT "LoyaltyAccount_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoyaltyTransaction" ADD CONSTRAINT "LoyaltyTransaction_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "LoyaltyAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NpsResponse" ADD CONSTRAINT "NpsResponse_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NpsResponse" ADD CONSTRAINT "NpsResponse_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NpsResponse" ADD CONSTRAINT "NpsResponse_responsavelId_fkey" FOREIGN KEY ("responsavelId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

`,
  },
];

// Migrations already applied/baselined in a previous run of this route.
const BASELINE_ONLY = [
  { name: "20260810151509_init_multiempresa", checksum: "246b70b2c3377a77239aae36c4cb9eb7e6162e8aa2807528eb8876b14556d716" },
  { name: "20260810203505_marketing_module", checksum: "c7b5e888c5f93f70b246782c3c7ce66deaaa16342c8ab0b52cb9efa798c8f3ab" },
  { name: "20260810222805_universidade_grupo_nord", checksum: "31d3052e64c32eacb5f2d2ee2a9728a03d9999be4e540e7865c7a926f5017ce3" },
  { name: "20260811060000_metas_venda_acumulada", checksum: "c41f8a7130ac3cfe72a1d397a51af40bed2987ab488fde6927be94a9674b8f2f" },
  { name: "20260811090000_ficha_tecnica_ifood_qualidade", checksum: "94cd3812016a4c77fb4e0afe45e6dd7f974e7736059d53ad1f497f22aeaa1231" },
  { name: "20260811110000_estoque_movimentacoes", checksum: "1695f9827e422aad38470e04c77d541e3280e6b740e526a4b45a0daac032bab0" },
  { name: "20260811130000_permission_profiles", checksum: "8053bfd017c659fd9eb6397747b408429080022fcce211c7e12131ec086664cc" },
  { name: "20260811150000_sale_transactions", checksum: "d0bb7a177ad0dbd392f491e24d3f6be9a06539b22bc70ce94ee9f6f045f07488" },
  { name: "20260811170000_crm_clientes", checksum: "b2cfa813ca2e1b50ba258c312c90a35c7f6cedf50bfef303297227ed95513ca2" },
];

async function runMigrations(token: string | null) {
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

    const { rows: applied } = await client.query<{ migration_name: string }>(
      `SELECT migration_name FROM "_prisma_migrations"`,
    );
    const appliedNames = new Set(applied.map((r) => r.migration_name));

    const toApply = PENDING_MIGRATIONS.filter((m) => !appliedNames.has(m.name));

    await client.query("BEGIN");

    for (const m of toApply) {
      await client.query(m.sql);
    }

    const toBaseline = [...BASELINE_ONLY, ...PENDING_MIGRATIONS].filter(
      (m) => !appliedNames.has(m.name),
    );
    for (const m of toBaseline) {
      await client.query(
        `INSERT INTO "_prisma_migrations" (id, checksum, finished_at, migration_name, started_at, applied_steps_count)
         VALUES ($1, $2, now(), $3, now(), 1)`,
        [crypto.randomUUID(), m.checksum, m.name],
      );
    }

    await client.query("COMMIT");
    return NextResponse.json({
      ok: true,
      applied: toApply.map((m) => m.name),
      alreadyApplied: PENDING_MIGRATIONS.filter((m) => appliedNames.has(m.name)).map((m) => m.name),
    });
  } catch (err) {
    await client.query("ROLLBACK");
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  } finally {
    await client.end();
  }
}

export async function POST(req: NextRequest) {
  return runMigrations(req.headers.get("x-migration-token"));
}

export async function GET(req: NextRequest) {
  return runMigrations(req.nextUrl.searchParams.get("token"));
}
