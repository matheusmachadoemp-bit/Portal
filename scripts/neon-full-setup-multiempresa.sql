-- Portal Nord — setup completo MULTILOJA (reset + tabelas + dados iniciais)
-- Cole este arquivo INTEIRO no SQL Editor do Neon e clique em Run UMA VEZ.
-- Isso apaga TODOS os dados atuais e recria o banco do zero, já com Nord Pizza + Zarki Sushi.

DROP SCHEMA IF EXISTS public CASCADE;
CREATE SCHEMA public;

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMINISTRADOR', 'GESTOR', 'GERENTE', 'SUPERVISOR', 'COLABORADOR');

-- CreateEnum
CREATE TYPE "AccessLevel" AS ENUM ('NENHUM', 'VISUALIZAR', 'EDITAR', 'TOTAL');

-- CreateEnum
CREATE TYPE "PeriodType" AS ENUM ('DIARIO', 'SEMANAL', 'MENSAL');

-- CreateEnum
CREATE TYPE "GoalCategory" AS ENUM ('GERENCIA', 'SALAO', 'COZINHA', 'DELIVERY');

-- CreateEnum
CREATE TYPE "GoalStatus" AS ENUM ('NAO_INICIADA', 'EM_ANDAMENTO', 'EM_RISCO', 'CONCLUIDA', 'NAO_ATINGIDA');

-- CreateEnum
CREATE TYPE "EmployeeStatus" AS ENUM ('ATIVO', 'FERIAS', 'AFASTADO', 'DESLIGADO');

-- CreateEnum
CREATE TYPE "OccurrenceType" AS ENUM ('FALTA', 'ATRASO', 'ATESTADO');

-- CreateEnum
CREATE TYPE "OccurrenceStatus" AS ENUM ('PENDENTE', 'JUSTIFICADA', 'NAO_JUSTIFICADA');

-- CreateEnum
CREATE TYPE "FileFolderType" AS ENUM ('ARQUIVO', 'CARTILHA', 'LOGO');

-- CreateEnum
CREATE TYPE "ProductCategory" AS ENUM ('PIZZA_SALGADA', 'PIZZA_DOCE', 'COMBO', 'ESFIHA_SALGADA', 'ESFIHA_DOCE', 'ACOMPANHAMENTO', 'BURGER', 'BEBIDA', 'DRINK');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('PIX', 'DINHEIRO', 'CARTAO_DEBITO', 'CARTAO_CREDITO', 'TED', 'DOC', 'TRANSFERENCIA', 'CHEQUE', 'OUTRO');

-- CreateEnum
CREATE TYPE "FinanceEntryStatus" AS ENUM ('EM_ABERTO', 'PAGO', 'PARCIALMENTE_PAGO', 'CANCELADO', 'ATRASADO');

-- CreateEnum
CREATE TYPE "FinanceCategoryType" AS ENUM ('RECEITA', 'DESPESA', 'CUSTO', 'INVESTIMENTO');

-- CreateEnum
CREATE TYPE "CashMovementType" AS ENUM ('ENTRADA', 'SAIDA', 'TRANSFERENCIA', 'APORTE_SOCIO', 'RETIRADA_SOCIO');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'COLABORADOR',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "avatarUrl" TEXT,
    "phone" TEXT,
    "resetToken" TEXT,
    "resetTokenExp" TIMESTAMP(3),
    "lastLoginAt" TIMESTAMP(3),
    "canViewGrupoNord" BOOLEAN NOT NULL DEFAULT false,
    "defaultEmpresaId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserPermission" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "moduleKey" TEXT NOT NULL,
    "level" "AccessLevel" NOT NULL DEFAULT 'VISUALIZAR',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserPermission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Empresa" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "logo" TEXT,
    "color" TEXT NOT NULL DEFAULT '#2952E3',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Empresa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserEmpresaAccess" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserEmpresaAccess_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "icon" TEXT NOT NULL DEFAULT 'LayoutGrid',
    "color" TEXT NOT NULL DEFAULT '#2952E3',
    "order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "contentType" TEXT NOT NULL DEFAULT 'custom',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subcategory" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "icon" TEXT NOT NULL DEFAULT 'Folder',
    "color" TEXT NOT NULL DEFAULT '#2952E3',
    "order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subcategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MenuPreference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "orderJson" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MenuPreference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesEntry" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "periodType" "PeriodType" NOT NULL DEFAULT 'DIARIO',
    "faturamentoDelivery" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "faturamentoSalao" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "pedidosDelivery" INTEGER NOT NULL DEFAULT 0,
    "pedidosBalcao" INTEGER NOT NULL DEFAULT 0,
    "pedidosSalao" INTEGER NOT NULL DEFAULT 0,
    "mesasAtendidas" INTEGER NOT NULL DEFAULT 0,
    "taxaServicoValor" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "metaDiaria" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "observacoes" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalesEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketingEntry" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "investimentoTrafego" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "receitaTrafego" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "pedidosCampanha" INTEGER NOT NULL DEFAULT 0,
    "visitasSite" INTEGER NOT NULL DEFAULT 0,
    "conversoes" INTEGER NOT NULL DEFAULT 0,
    "seguidoresInicio" INTEGER NOT NULL DEFAULT 0,
    "seguidoresFim" INTEGER NOT NULL DEFAULT 0,
    "curtidas" INTEGER NOT NULL DEFAULT 0,
    "comentarios" INTEGER NOT NULL DEFAULT 0,
    "compartilhamentos" INTEGER NOT NULL DEFAULT 0,
    "salvamentos" INTEGER NOT NULL DEFAULT 0,
    "alcance" INTEGER NOT NULL DEFAULT 0,
    "impressoes" INTEGER NOT NULL DEFAULT 0,
    "observacoes" TEXT,
    "planoDeAcao" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketingEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Goal" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "GoalCategory" NOT NULL,
    "responsavel" TEXT NOT NULL,
    "description" TEXT,
    "indicador" TEXT,
    "valorMeta" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "valorRealizado" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "unidade" TEXT NOT NULL DEFAULT 'R$',
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "bonificacao" TEXT,
    "status" "GoalStatus" NOT NULL DEFAULT 'NAO_INICIADA',
    "observacoes" TEXT,
    "planoDeAcao" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Goal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GoalAttachment" (
    "id" TEXT NOT NULL,
    "goalId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GoalAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Employee" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "cargo" TEXT NOT NULL,
    "setor" TEXT NOT NULL,
    "admissionDate" TIMESTAMP(3) NOT NULL,
    "terminationDate" TIMESTAMP(3),
    "status" "EmployeeStatus" NOT NULL DEFAULT 'ATIVO',
    "phone" TEXT,
    "email" TEXT,
    "gestorResponsavel" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Employee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Occurrence" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "type" "OccurrenceType" NOT NULL,
    "horarioPrevisto" TEXT,
    "horarioRealizado" TEXT,
    "minutosAtraso" INTEGER NOT NULL DEFAULT 0,
    "justificativa" TEXT,
    "anexoUrl" TEXT,
    "observacao" TEXT,
    "status" "OccurrenceStatus" NOT NULL DEFAULT 'PENDENTE',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Occurrence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VaultEntry" (
    "id" TEXT NOT NULL,
    "systemName" TEXT NOT NULL,
    "site" TEXT,
    "username" TEXT NOT NULL,
    "passwordCipher" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'Geral',
    "responsavel" TEXT,
    "observacao" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VaultEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VaultHistory" (
    "id" TEXT NOT NULL,
    "vaultEntryId" TEXT NOT NULL,
    "changedBy" TEXT NOT NULL,
    "changeType" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VaultHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VaultAccessLog" (
    "id" TEXT NOT NULL,
    "vaultEntryId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VaultAccessLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Course" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "plataforma" TEXT,
    "link" TEXT,
    "usuario" TEXT,
    "senha" TEXT,
    "responsavel" TEXT,
    "percentualConcluido" INTEGER NOT NULL DEFAULT 0,
    "startDate" TIMESTAMP(3),
    "prazo" TIMESTAMP(3),
    "certificadoUrl" TEXT,
    "observacoes" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Course_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FileItem" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "folderType" "FileFolderType" NOT NULL DEFAULT 'ARQUIVO',
    "parentId" TEXT,
    "isFolder" BOOLEAN NOT NULL DEFAULT false,
    "fileUrl" TEXT,
    "mimeType" TEXT,
    "sizeBytes" INTEGER,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FileItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ingredient" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "fornecedor" TEXT,
    "unidade" TEXT NOT NULL DEFAULT 'g',
    "precoAtual" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "quantidadeEmbalagem" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "percentualPerda" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "estoqueMinimo" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "estoqueAtual" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "lastPurchaseDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Ingredient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IngredientPriceHistory" (
    "id" TEXT NOT NULL,
    "ingredientId" TEXT NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IngredientPriceHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "category" "ProductCategory" NOT NULL,
    "photoUrl" TEXT,
    "description" TEXT,
    "rendimento" TEXT,
    "tamanho" TEXT,
    "pesoFinal" DOUBLE PRECISION,
    "precoVenda" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "modoPreparo" TEXT,
    "tempoPreparo" INTEGER,
    "validade" TEXT,
    "responsavel" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductIngredient" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "ingredientId" TEXT NOT NULL,
    "quantidadeUsada" DOUBLE PRECISION NOT NULL,
    "percentualPerda" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "ProductIngredient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankAccount" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "bank" TEXT,
    "agencia" TEXT,
    "conta" TEXT,
    "tipo" TEXT NOT NULL DEFAULT 'Conta Corrente',
    "saldoInicial" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "saldoAtual" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "color" TEXT NOT NULL DEFAULT '#2952E3',
    "icon" TEXT NOT NULL DEFAULT 'Landmark',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BankAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancialCategory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "FinanceCategoryType" NOT NULL DEFAULT 'DESPESA',
    "dreKey" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinancialCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceAttachment" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinanceAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecurringTemplate" (
    "id" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "fornecedorCliente" TEXT,
    "categoriaId" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "centroCusto" TEXT,
    "valor" DOUBLE PRECISION NOT NULL,
    "diaVencimento" INTEGER NOT NULL,
    "bankAccountId" TEXT NOT NULL,
    "formaPagamento" "PaymentMethod" NOT NULL DEFAULT 'PIX',
    "infinita" BOOLEAN NOT NULL DEFAULT false,
    "quantidadeMeses" INTEGER,
    "dataInicio" TIMESTAMP(3) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecurringTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payable" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "fornecedor" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "categoriaId" TEXT NOT NULL,
    "centroCusto" TEXT,
    "empresaId" TEXT NOT NULL,
    "valor" DOUBLE PRECISION NOT NULL,
    "dataCompetencia" TIMESTAMP(3) NOT NULL,
    "dataVencimento" TIMESTAMP(3) NOT NULL,
    "dataPagamento" TIMESTAMP(3),
    "bankAccountId" TEXT,
    "formaPagamento" "PaymentMethod",
    "parcelado" BOOLEAN NOT NULL DEFAULT false,
    "quantidadeParcelas" INTEGER,
    "parcelaAtual" INTEGER,
    "observacoes" TEXT,
    "status" "FinanceEntryStatus" NOT NULL DEFAULT 'EM_ABERTO',
    "recurringTemplateId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Receivable" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "cliente" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "categoriaId" TEXT NOT NULL,
    "centroCusto" TEXT,
    "empresaId" TEXT NOT NULL,
    "valor" DOUBLE PRECISION NOT NULL,
    "dataCompetencia" TIMESTAMP(3) NOT NULL,
    "dataVencimento" TIMESTAMP(3) NOT NULL,
    "dataRecebimento" TIMESTAMP(3),
    "bankAccountId" TEXT,
    "formaRecebimento" "PaymentMethod",
    "parcelado" BOOLEAN NOT NULL DEFAULT false,
    "quantidadeParcelas" INTEGER,
    "parcelaAtual" INTEGER,
    "observacoes" TEXT,
    "status" "FinanceEntryStatus" NOT NULL DEFAULT 'EM_ABERTO',
    "recurringTemplateId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Receivable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CashMovement" (
    "id" TEXT NOT NULL,
    "type" "CashMovementType" NOT NULL,
    "bankAccountId" TEXT NOT NULL,
    "destinoId" TEXT,
    "valor" DOUBLE PRECISION NOT NULL,
    "descricao" TEXT,
    "empresaId" TEXT,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CashMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "empresaId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "before" TEXT,
    "after" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "UserPermission_userId_moduleKey_key" ON "UserPermission"("userId", "moduleKey");

-- CreateIndex
CREATE UNIQUE INDEX "Empresa_key_key" ON "Empresa"("key");

-- CreateIndex
CREATE UNIQUE INDEX "UserEmpresaAccess_userId_empresaId_key" ON "UserEmpresaAccess"("userId", "empresaId");

-- CreateIndex
CREATE UNIQUE INDEX "Category_key_key" ON "Category"("key");

-- CreateIndex
CREATE UNIQUE INDEX "Subcategory_categoryId_key_key" ON "Subcategory"("categoryId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "MenuPreference_userId_key" ON "MenuPreference"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Product_code_key" ON "Product"("code");

-- CreateIndex
CREATE UNIQUE INDEX "FinancialCategory_name_key" ON "FinancialCategory"("name");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_defaultEmpresaId_fkey" FOREIGN KEY ("defaultEmpresaId") REFERENCES "Empresa"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserPermission" ADD CONSTRAINT "UserPermission_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserEmpresaAccess" ADD CONSTRAINT "UserEmpresaAccess_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserEmpresaAccess" ADD CONSTRAINT "UserEmpresaAccess_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subcategory" ADD CONSTRAINT "Subcategory_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MenuPreference" ADD CONSTRAINT "MenuPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesEntry" ADD CONSTRAINT "SalesEntry_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesEntry" ADD CONSTRAINT "SalesEntry_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingEntry" ADD CONSTRAINT "MarketingEntry_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingEntry" ADD CONSTRAINT "MarketingEntry_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Goal" ADD CONSTRAINT "Goal_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Goal" ADD CONSTRAINT "Goal_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoalAttachment" ADD CONSTRAINT "GoalAttachment_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "Goal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Occurrence" ADD CONSTRAINT "Occurrence_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Occurrence" ADD CONSTRAINT "Occurrence_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VaultEntry" ADD CONSTRAINT "VaultEntry_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VaultHistory" ADD CONSTRAINT "VaultHistory_vaultEntryId_fkey" FOREIGN KEY ("vaultEntryId") REFERENCES "VaultEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VaultAccessLog" ADD CONSTRAINT "VaultAccessLog_vaultEntryId_fkey" FOREIGN KEY ("vaultEntryId") REFERENCES "VaultEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VaultAccessLog" ADD CONSTRAINT "VaultAccessLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Course" ADD CONSTRAINT "Course_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FileItem" ADD CONSTRAINT "FileItem_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "FileItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FileItem" ADD CONSTRAINT "FileItem_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ingredient" ADD CONSTRAINT "Ingredient_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IngredientPriceHistory" ADD CONSTRAINT "IngredientPriceHistory_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "Ingredient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductIngredient" ADD CONSTRAINT "ProductIngredient_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductIngredient" ADD CONSTRAINT "ProductIngredient_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "Ingredient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankAccount" ADD CONSTRAINT "BankAccount_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringTemplate" ADD CONSTRAINT "RecurringTemplate_categoriaId_fkey" FOREIGN KEY ("categoriaId") REFERENCES "FinancialCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringTemplate" ADD CONSTRAINT "RecurringTemplate_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringTemplate" ADD CONSTRAINT "RecurringTemplate_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringTemplate" ADD CONSTRAINT "RecurringTemplate_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payable" ADD CONSTRAINT "Payable_categoriaId_fkey" FOREIGN KEY ("categoriaId") REFERENCES "FinancialCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payable" ADD CONSTRAINT "Payable_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payable" ADD CONSTRAINT "Payable_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payable" ADD CONSTRAINT "Payable_recurringTemplateId_fkey" FOREIGN KEY ("recurringTemplateId") REFERENCES "RecurringTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payable" ADD CONSTRAINT "Payable_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Receivable" ADD CONSTRAINT "Receivable_categoriaId_fkey" FOREIGN KEY ("categoriaId") REFERENCES "FinancialCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Receivable" ADD CONSTRAINT "Receivable_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Receivable" ADD CONSTRAINT "Receivable_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Receivable" ADD CONSTRAINT "Receivable_recurringTemplateId_fkey" FOREIGN KEY ("recurringTemplateId") REFERENCES "RecurringTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Receivable" ADD CONSTRAINT "Receivable_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashMovement" ADD CONSTRAINT "CashMovement_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashMovement" ADD CONSTRAINT "CashMovement_destinoId_fkey" FOREIGN KEY ("destinoId") REFERENCES "BankAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashMovement" ADD CONSTRAINT "CashMovement_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashMovement" ADD CONSTRAINT "CashMovement_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ===== DADOS INICIAIS (empresas, usuários, categorias, lançamentos demo) =====

--
-- PostgreSQL database dump
--


-- Dumped from database version 16.13 (Ubuntu 16.13-0ubuntu0.24.04.1)
-- Dumped by pg_dump version 16.13 (Ubuntu 16.13-0ubuntu0.24.04.1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Data for Name: Empresa; Type: TABLE DATA; Schema: public; Owner: portal
--

INSERT INTO public."Empresa" (id, key, name, logo, color, active, "order", "createdAt", "updatedAt") VALUES ('cmsndjpe00000497dhfcr8mzd', 'nord-pizza', 'Nord Pizza & Burger', NULL, '#2952E3', true, 0, '2026-08-10 15:16:31.944', '2026-08-10 15:16:31.944');
INSERT INTO public."Empresa" (id, key, name, logo, color, active, "order", "createdAt", "updatedAt") VALUES ('cmsndjpeg0001497dhtlyr5f9', 'zarki-sushi', 'Zarki Sushi', NULL, '#e91e63', true, 1, '2026-08-10 15:16:31.96', '2026-08-10 15:16:31.96');


--
-- Data for Name: User; Type: TABLE DATA; Schema: public; Owner: portal
--

INSERT INTO public."User" (id, name, email, "passwordHash", role, active, "avatarUrl", phone, "resetToken", "resetTokenExp", "lastLoginAt", "canViewGrupoNord", "defaultEmpresaId", "createdAt", "updatedAt") VALUES ('cmsndjph70002497dqw8826yk', 'Administrador Nord', 'admin@nordpizza.com', '$2b$10$28oZS76MNPh0mw0eAPbuZuoRqxe9x/pHl9vUeg/coW3pyvMN3i7wK', 'ADMINISTRADOR', true, NULL, NULL, NULL, NULL, '2026-08-10 15:43:13.318', true, 'cmsndjpe00000497dhfcr8mzd', '2026-08-10 15:16:32.059', '2026-08-10 15:43:13.323');
INSERT INTO public."User" (id, name, email, "passwordHash", role, active, "avatarUrl", phone, "resetToken", "resetTokenExp", "lastLoginAt", "canViewGrupoNord", "defaultEmpresaId", "createdAt", "updatedAt") VALUES ('cmsndjpjl0003497dnui645jc', 'Gerente Nord', 'gerente@nordpizza.com', '$2b$10$zi9kwKhOGo75DxMrqsMUUuKXJ0yvSsnc07q65olKqbMC8uIid5MiK', 'GERENTE', true, NULL, NULL, NULL, NULL, '2026-08-10 15:43:48.33', false, 'cmsndjpe00000497dhfcr8mzd', '2026-08-10 15:16:32.145', '2026-08-10 15:43:48.331');


--
-- Data for Name: AuditLog; Type: TABLE DATA; Schema: public; Owner: portal
--



--
-- Data for Name: BankAccount; Type: TABLE DATA; Schema: public; Owner: portal
--

INSERT INTO public."BankAccount" (id, "empresaId", name, bank, agencia, conta, tipo, "saldoInicial", "saldoAtual", color, icon, active, "createdAt", "updatedAt") VALUES ('cmsndjpy00069497d03vd9dr1', 'cmsndjpe00000497dhfcr8mzd', 'Banco Inter', 'Inter', NULL, NULL, 'Conta Corrente', 0, 0, '#f97316', 'Landmark', true, '2026-08-10 15:16:32.664', '2026-08-10 15:16:32.664');
INSERT INTO public."BankAccount" (id, "empresaId", name, bank, agencia, conta, tipo, "saldoInicial", "saldoAtual", color, icon, active, "createdAt", "updatedAt") VALUES ('cmsndjpy0006a497dvoxhj3zs', 'cmsndjpe00000497dhfcr8mzd', 'Mercado Pago', 'Mercado Pago', NULL, NULL, 'Conta Digital', 0, 0, '#2952E3', 'Wallet', true, '2026-08-10 15:16:32.664', '2026-08-10 15:16:32.664');
INSERT INTO public."BankAccount" (id, "empresaId", name, bank, agencia, conta, tipo, "saldoInicial", "saldoAtual", color, icon, active, "createdAt", "updatedAt") VALUES ('cmsndjpy0006b497dxat1fgrk', 'cmsndjpe00000497dhfcr8mzd', 'Caixa Físico', NULL, NULL, NULL, 'Caixa', 0, 0, '#22c55e', 'Banknote', true, '2026-08-10 15:16:32.664', '2026-08-10 15:16:32.664');
INSERT INTO public."BankAccount" (id, "empresaId", name, bank, agencia, conta, tipo, "saldoInicial", "saldoAtual", color, icon, active, "createdAt", "updatedAt") VALUES ('cmsndjpy0006c497d7n0erq0u', 'cmsndjpeg0001497dhtlyr5f9', 'Nubank', 'Nubank', NULL, NULL, 'Conta Corrente', 0, 0, '#a855f7', 'Landmark', true, '2026-08-10 15:16:32.664', '2026-08-10 15:16:32.664');
INSERT INTO public."BankAccount" (id, "empresaId", name, bank, agencia, conta, tipo, "saldoInicial", "saldoAtual", color, icon, active, "createdAt", "updatedAt") VALUES ('cmsndjpy0006d497dpcgyj66l', 'cmsndjpeg0001497dhtlyr5f9', 'Caixa Físico', NULL, NULL, NULL, 'Caixa', 0, 0, '#22c55e', 'Banknote', true, '2026-08-10 15:16:32.664', '2026-08-10 15:16:32.664');


--
-- Data for Name: CashMovement; Type: TABLE DATA; Schema: public; Owner: portal
--



--
-- Data for Name: Category; Type: TABLE DATA; Schema: public; Owner: portal
--

INSERT INTO public."Category" (id, key, name, icon, color, "order", active, "isSystem", "contentType", "createdAt", "updatedAt") VALUES ('cmsndjpk40007497d5m0v8cud', 'inicio', 'Início', 'Home', '#2952E3', 0, true, true, 'dashboard', '2026-08-10 15:16:32.164', '2026-08-10 15:42:48.988');
INSERT INTO public."Category" (id, key, name, icon, color, "order", active, "isSystem", "contentType", "createdAt", "updatedAt") VALUES ('cmsndjpk70008497deleoy5kg', 'vendas', 'Vendas', 'ShoppingCart', '#2952E3', 1, true, true, 'vendas', '2026-08-10 15:16:32.167', '2026-08-10 15:42:48.991');
INSERT INTO public."Category" (id, key, name, icon, color, "order", active, "isSystem", "contentType", "createdAt", "updatedAt") VALUES ('cmsndjpk90009497dxh001jud', 'marketing', 'Marketing', 'Megaphone', '#2952E3', 2, true, true, 'marketing', '2026-08-10 15:16:32.169', '2026-08-10 15:42:48.994');
INSERT INTO public."Category" (id, key, name, icon, color, "order", active, "isSystem", "contentType", "createdAt", "updatedAt") VALUES ('cmsndjpkb000a497di5x93f8y', 'metas', 'Metas', 'Target', '#2952E3', 3, true, true, 'metas', '2026-08-10 15:16:32.171', '2026-08-10 15:42:48.996');
INSERT INTO public."Category" (id, key, name, icon, color, "order", active, "isSystem", "contentType", "createdAt", "updatedAt") VALUES ('cmsndjpkk000f497dwzxxyhhn', 'rh', 'RH', 'Users', '#2952E3', 4, true, true, 'rh', '2026-08-10 15:16:32.18', '2026-08-10 15:42:49.006');
INSERT INTO public."Category" (id, key, name, icon, color, "order", active, "isSystem", "contentType", "createdAt", "updatedAt") VALUES ('cmsndjpkp000i497docfcnodw', 'administrativo', 'Administrativo', 'Building2', '#2952E3', 5, true, true, 'administrativo', '2026-08-10 15:16:32.185', '2026-08-10 15:42:49.012');
INSERT INTO public."Category" (id, key, name, icon, color, "order", active, "isSystem", "contentType", "createdAt", "updatedAt") VALUES ('cmsndjpky000o497dd42l4w2m', 'ficha-tecnica', 'Ficha Técnica', 'ClipboardList', '#2952E3', 6, true, true, 'ficha-tecnica', '2026-08-10 15:16:32.194', '2026-08-10 15:42:49.021');
INSERT INTO public."Category" (id, key, name, icon, color, "order", active, "isSystem", "contentType", "createdAt", "updatedAt") VALUES ('cmsndjplh000z497dv2mxkt8n', 'financeiro', 'Financeiro', 'Wallet', '#2952E3', 7, true, true, 'financeiro', '2026-08-10 15:16:32.213', '2026-08-10 15:42:49.038');
INSERT INTO public."Category" (id, key, name, icon, color, "order", active, "isSystem", "contentType", "createdAt", "updatedAt") VALUES ('cmsndjply0019497dn2axpnli', 'configuracoes', 'Configurações', 'Settings', '#2952E3', 8, true, true, 'configuracoes', '2026-08-10 15:16:32.23', '2026-08-10 15:42:49.052');
INSERT INTO public."Category" (id, key, name, icon, color, "order", active, "isSystem", "contentType", "createdAt", "updatedAt") VALUES ('cmsndjplz001a497dcaqfoq6t', 'usuarios', 'Usuários', 'UserCog', '#2952E3', 9, true, true, 'usuarios', '2026-08-10 15:16:32.231', '2026-08-10 15:42:49.054');


--
-- Data for Name: Course; Type: TABLE DATA; Schema: public; Owner: portal
--



--
-- Data for Name: Employee; Type: TABLE DATA; Schema: public; Owner: portal
--

INSERT INTO public."Employee" (id, "empresaId", name, cargo, setor, "admissionDate", "terminationDate", status, phone, email, "gestorResponsavel", "createdAt", "updatedAt") VALUES ('cmsndjprn003h497dyodbndf7', 'cmsndjpe00000497dhfcr8mzd', 'Carlos Silva', 'Pizzaiolo', 'Cozinha', '2023-03-10 00:00:00', NULL, 'ATIVO', NULL, NULL, 'Gerente Nord', '2026-08-10 15:16:32.435', '2026-08-10 15:16:32.435');
INSERT INTO public."Employee" (id, "empresaId", name, cargo, setor, "admissionDate", "terminationDate", status, phone, email, "gestorResponsavel", "createdAt", "updatedAt") VALUES ('cmsndjprp003i497d9wqc95ut', 'cmsndjpe00000497dhfcr8mzd', 'Ana Souza', 'Atendente', 'Salão', '2024-06-03 00:00:00', NULL, 'ATIVO', NULL, NULL, 'Gerente Nord', '2026-08-10 15:16:32.437', '2026-08-10 15:16:32.437');
INSERT INTO public."Employee" (id, "empresaId", name, cargo, setor, "admissionDate", "terminationDate", status, phone, email, "gestorResponsavel", "createdAt", "updatedAt") VALUES ('cmsndjprq003j497d0z8ecvc1', 'cmsndjpe00000497dhfcr8mzd', 'Bruno Costa', 'Motoboy', 'Delivery', '2022-09-20 00:00:00', NULL, 'ATIVO', NULL, NULL, 'Gerente Nord', '2026-08-10 15:16:32.438', '2026-08-10 15:16:32.438');
INSERT INTO public."Employee" (id, "empresaId", name, cargo, setor, "admissionDate", "terminationDate", status, phone, email, "gestorResponsavel", "createdAt", "updatedAt") VALUES ('cmsndjprs003k497d2reay6wi', 'cmsndjpeg0001497dhtlyr5f9', 'Kenji Tanaka', 'Sushiman', 'Cozinha', '2023-07-01 00:00:00', NULL, 'ATIVO', NULL, NULL, 'Gerente Zarki', '2026-08-10 15:16:32.44', '2026-08-10 15:16:32.44');
INSERT INTO public."Employee" (id, "empresaId", name, cargo, setor, "admissionDate", "terminationDate", status, phone, email, "gestorResponsavel", "createdAt", "updatedAt") VALUES ('cmsndjprt003l497dc4j4tjyr', 'cmsndjpeg0001497dhtlyr5f9', 'Larissa Nunes', 'Atendente', 'Salão', '2024-02-15 00:00:00', NULL, 'ATIVO', NULL, NULL, 'Gerente Zarki', '2026-08-10 15:16:32.441', '2026-08-10 15:16:32.441');


--
-- Data for Name: FileItem; Type: TABLE DATA; Schema: public; Owner: portal
--



--
-- Data for Name: FinanceAttachment; Type: TABLE DATA; Schema: public; Owner: portal
--



--
-- Data for Name: FinancialCategory; Type: TABLE DATA; Schema: public; Owner: portal
--

INSERT INTO public."FinancialCategory" (id, name, type, "dreKey", active, "createdAt", "updatedAt") VALUES ('cmsndjptu0043497dytbafoa8', 'Faturamento de Taxa de Entrega Restaurante', 'RECEITA', 'faturamento-taxa-entrega', true, '2026-08-10 15:16:32.514', '2026-08-10 15:42:49.073');
INSERT INTO public."FinancialCategory" (id, name, type, "dreKey", active, "createdAt", "updatedAt") VALUES ('cmsndjptw0044497ddiixl788', 'Faturamento com Taxa de Serviço', 'RECEITA', 'faturamento-taxa-servico', true, '2026-08-10 15:16:32.516', '2026-08-10 15:42:49.074');
INSERT INTO public."FinancialCategory" (id, name, type, "dreKey", active, "createdAt", "updatedAt") VALUES ('cmsndjpty0045497d60iogadl', 'Faturamento com Comissão de Atendimento', 'RECEITA', 'faturamento-comissao-atendimento', true, '2026-08-10 15:16:32.518', '2026-08-10 15:42:49.076');
INSERT INTO public."FinancialCategory" (id, name, type, "dreKey", active, "createdAt", "updatedAt") VALUES ('cmsndjpu00046497dpu0014ki', 'Acréscimos', 'RECEITA', 'acrescimos', true, '2026-08-10 15:16:32.52', '2026-08-10 15:42:49.078');
INSERT INTO public."FinancialCategory" (id, name, type, "dreKey", active, "createdAt", "updatedAt") VALUES ('cmsndjpu20047497do3uf8he1', 'Outros Faturamentos', 'RECEITA', 'outros-faturamentos', true, '2026-08-10 15:16:32.522', '2026-08-10 15:42:49.08');
INSERT INTO public."FinancialCategory" (id, name, type, "dreKey", active, "createdAt", "updatedAt") VALUES ('cmsndjpu40048497dqryagwqc', 'SIMPLES', 'DESPESA', 'simples', true, '2026-08-10 15:16:32.524', '2026-08-10 15:42:49.082');
INSERT INTO public."FinancialCategory" (id, name, type, "dreKey", active, "createdAt", "updatedAt") VALUES ('cmsndjpu60049497ds6w0z93y', 'ICMS', 'DESPESA', 'icms', true, '2026-08-10 15:16:32.526', '2026-08-10 15:42:49.084');
INSERT INTO public."FinancialCategory" (id, name, type, "dreKey", active, "createdAt", "updatedAt") VALUES ('cmsndjpu8004a497dt4seolmb', 'Outros Impostos', 'DESPESA', 'outros-impostos', true, '2026-08-10 15:16:32.528', '2026-08-10 15:42:49.085');
INSERT INTO public."FinancialCategory" (id, name, type, "dreKey", active, "createdAt", "updatedAt") VALUES ('cmsndjpua004b497da6y56rh2', 'Custos Com Marketplace (Ifood+99)', 'CUSTO', 'marketplace', true, '2026-08-10 15:16:32.53', '2026-08-10 15:42:49.087');
INSERT INTO public."FinancialCategory" (id, name, type, "dreKey", active, "createdAt", "updatedAt") VALUES ('cmsndjpuc004c497daysy0qmb', 'Motoboy', 'CUSTO', 'motoboy', true, '2026-08-10 15:16:32.532', '2026-08-10 15:42:49.089');
INSERT INTO public."FinancialCategory" (id, name, type, "dreKey", active, "createdAt", "updatedAt") VALUES ('cmsndjpue004d497dle8n9bkv', 'Taxa de Entrega', 'CUSTO', 'taxa-entrega-custo', true, '2026-08-10 15:16:32.534', '2026-08-10 15:42:49.09');
INSERT INTO public."FinancialCategory" (id, name, type, "dreKey", active, "createdAt", "updatedAt") VALUES ('cmsndjpug004e497drkbn5ivq', 'Comissões e Gorjetas', 'CUSTO', 'comissoes-gorjetas', true, '2026-08-10 15:16:32.536', '2026-08-10 15:42:49.092');
INSERT INTO public."FinancialCategory" (id, name, type, "dreKey", active, "createdAt", "updatedAt") VALUES ('cmsndjpui004f497dqcqi7c7u', 'Tarifas com Cartão', 'CUSTO', 'tarifas-cartao', true, '2026-08-10 15:16:32.538', '2026-08-10 15:42:49.094');
INSERT INTO public."FinancialCategory" (id, name, type, "dreKey", active, "createdAt", "updatedAt") VALUES ('cmsndjpuk004g497dzf9la5ym', 'Descontos', 'CUSTO', 'descontos', true, '2026-08-10 15:16:32.54', '2026-08-10 15:42:49.095');
INSERT INTO public."FinancialCategory" (id, name, type, "dreKey", active, "createdAt", "updatedAt") VALUES ('cmsndjpum004h497dqwdj7v8p', 'Custo com Tele entrega', 'CUSTO', 'custo-tele-entrega', true, '2026-08-10 15:16:32.542', '2026-08-10 15:42:49.097');
INSERT INTO public."FinancialCategory" (id, name, type, "dreKey", active, "createdAt", "updatedAt") VALUES ('cmsndjpuo004i497dnou2bg4k', 'Vale sócios', 'CUSTO', 'vale-socios', true, '2026-08-10 15:16:32.544', '2026-08-10 15:42:49.098');
INSERT INTO public."FinancialCategory" (id, name, type, "dreKey", active, "createdAt", "updatedAt") VALUES ('cmsndjpuq004j497dzscg8uun', 'Insumos', 'CUSTO', 'insumos', true, '2026-08-10 15:16:32.546', '2026-08-10 15:42:49.1');
INSERT INTO public."FinancialCategory" (id, name, type, "dreKey", active, "createdAt", "updatedAt") VALUES ('cmsndjpus004k497d9k54xawn', 'Gelo', 'CUSTO', 'gelo', true, '2026-08-10 15:16:32.548', '2026-08-10 15:42:49.102');
INSERT INTO public."FinancialCategory" (id, name, type, "dreKey", active, "createdAt", "updatedAt") VALUES ('cmsndjpuv004l497dvy1lmmxn', 'Bebidas', 'CUSTO', 'bebidas', true, '2026-08-10 15:16:32.551', '2026-08-10 15:42:49.103');
INSERT INTO public."FinancialCategory" (id, name, type, "dreKey", active, "createdAt", "updatedAt") VALUES ('cmsndjpux004m497d0oulaeao', 'Mercadorias', 'CUSTO', 'mercadorias', true, '2026-08-10 15:16:32.553', '2026-08-10 15:42:49.105');
INSERT INTO public."FinancialCategory" (id, name, type, "dreKey", active, "createdAt", "updatedAt") VALUES ('cmsndjpuz004n497dycubwh8u', 'Mercado', 'CUSTO', 'mercado', true, '2026-08-10 15:16:32.555', '2026-08-10 15:42:49.107');
INSERT INTO public."FinancialCategory" (id, name, type, "dreKey", active, "createdAt", "updatedAt") VALUES ('cmsndjpv1004o497d38rv1qoy', 'Balanço de estoque', 'CUSTO', 'balanco-estoque', true, '2026-08-10 15:16:32.557', '2026-08-10 15:42:49.108');
INSERT INTO public."FinancialCategory" (id, name, type, "dreKey", active, "createdAt", "updatedAt") VALUES ('cmsndjpv3004p497d396j8omx', 'Embalagens', 'CUSTO', 'embalagens-item', true, '2026-08-10 15:16:32.559', '2026-08-10 15:42:49.11');
INSERT INTO public."FinancialCategory" (id, name, type, "dreKey", active, "createdAt", "updatedAt") VALUES ('cmsndjpv5004q497d0310ikvi', 'Descartáveis', 'CUSTO', 'descartaveis', true, '2026-08-10 15:16:32.561', '2026-08-10 15:42:49.111');
INSERT INTO public."FinancialCategory" (id, name, type, "dreKey", active, "createdAt", "updatedAt") VALUES ('cmsndjpv7004r497d2177rdcx', 'Bobinas e etiquetas', 'CUSTO', 'bobinas-etiquetas', true, '2026-08-10 15:16:32.563', '2026-08-10 15:42:49.113');
INSERT INTO public."FinancialCategory" (id, name, type, "dreKey", active, "createdAt", "updatedAt") VALUES ('cmsndjpvc004t497dx8rs2ass', 'Água', 'DESPESA', 'agua', true, '2026-08-10 15:16:32.568', '2026-08-10 15:42:49.117');
INSERT INTO public."FinancialCategory" (id, name, type, "dreKey", active, "createdAt", "updatedAt") VALUES ('cmsndjpve004u497d9uwbtotj', 'Advogada', 'DESPESA', 'advogada', true, '2026-08-10 15:16:32.57', '2026-08-10 15:42:49.119');
INSERT INTO public."FinancialCategory" (id, name, type, "dreKey", active, "createdAt", "updatedAt") VALUES ('cmsndjpvg004v497do2euqo4k', 'Aluguel de Imóvel', 'DESPESA', 'aluguel', true, '2026-08-10 15:16:32.572', '2026-08-10 15:42:49.121');
INSERT INTO public."FinancialCategory" (id, name, type, "dreKey", active, "createdAt", "updatedAt") VALUES ('cmsndjpvi004w497do9jjddpk', 'Cartão', 'DESPESA', 'cartao-despesa', true, '2026-08-10 15:16:32.574', '2026-08-10 15:42:49.122');
INSERT INTO public."FinancialCategory" (id, name, type, "dreKey", active, "createdAt", "updatedAt") VALUES ('cmsndjpvk004x497df4tmuwe3', 'Contador', 'DESPESA', 'contador', true, '2026-08-10 15:16:32.576', '2026-08-10 15:42:49.124');
INSERT INTO public."FinancialCategory" (id, name, type, "dreKey", active, "createdAt", "updatedAt") VALUES ('cmsndjpvm004y497dpn9jbcd9', 'Consultoria e Assessoria', 'DESPESA', 'consultoria', true, '2026-08-10 15:16:32.578', '2026-08-10 15:42:49.125');
INSERT INTO public."FinancialCategory" (id, name, type, "dreKey", active, "createdAt", "updatedAt") VALUES ('cmsndjpvp004z497d0ugxmcy6', 'Consumos', 'DESPESA', 'consumos', true, '2026-08-10 15:16:32.581', '2026-08-10 15:42:49.127');
INSERT INTO public."FinancialCategory" (id, name, type, "dreKey", active, "createdAt", "updatedAt") VALUES ('cmsndjpvr0050497d0w4267as', 'Dedetização', 'DESPESA', 'dedetizacao', true, '2026-08-10 15:16:32.583', '2026-08-10 15:42:49.128');
INSERT INTO public."FinancialCategory" (id, name, type, "dreKey", active, "createdAt", "updatedAt") VALUES ('cmsndjpvt0051497dyse4b4tc', 'Luz - Energia elétrica', 'DESPESA', 'energia', true, '2026-08-10 15:16:32.585', '2026-08-10 15:42:49.13');
INSERT INTO public."FinancialCategory" (id, name, type, "dreKey", active, "createdAt", "updatedAt") VALUES ('cmsndjpvv0052497diduzmo7m', 'Limpeza', 'DESPESA', 'limpeza', true, '2026-08-10 15:16:32.587', '2026-08-10 15:42:49.131');
INSERT INTO public."FinancialCategory" (id, name, type, "dreKey", active, "createdAt", "updatedAt") VALUES ('cmsndjpvx0053497dhfr65f0h', 'Material de Limpeza', 'DESPESA', 'material-limpeza', true, '2026-08-10 15:16:32.589', '2026-08-10 15:42:49.133');
INSERT INTO public."FinancialCategory" (id, name, type, "dreKey", active, "createdAt", "updatedAt") VALUES ('cmsndjpvz0054497ddzlhi1rk', 'Manutenção Geral', 'DESPESA', 'manutencao-geral', true, '2026-08-10 15:16:32.591', '2026-08-10 15:42:49.135');
INSERT INTO public."FinancialCategory" (id, name, type, "dreKey", active, "createdAt", "updatedAt") VALUES ('cmsndjpw10055497dew5hahjj', 'Utensílios de Cozinha', 'DESPESA', 'utensilios-cozinha', true, '2026-08-10 15:16:32.593', '2026-08-10 15:42:49.136');
INSERT INTO public."FinancialCategory" (id, name, type, "dreKey", active, "createdAt", "updatedAt") VALUES ('cmsndjpw30056497dhkzds5pe', 'Gás', 'DESPESA', 'gas', true, '2026-08-10 15:16:32.595', '2026-08-10 15:42:49.138');
INSERT INTO public."FinancialCategory" (id, name, type, "dreKey", active, "createdAt", "updatedAt") VALUES ('cmsndjpw50057497dvzq0wfz4', 'Sistemas e Softwares', 'DESPESA', 'sistemas-softwares', true, '2026-08-10 15:16:32.597', '2026-08-10 15:42:49.139');
INSERT INTO public."FinancialCategory" (id, name, type, "dreKey", active, "createdAt", "updatedAt") VALUES ('cmsndjpw70058497d87dczvn0', 'Seguro', 'DESPESA', 'seguro', true, '2026-08-10 15:16:32.599', '2026-08-10 15:42:49.141');
INSERT INTO public."FinancialCategory" (id, name, type, "dreKey", active, "createdAt", "updatedAt") VALUES ('cmsndjpw90059497dditvd04r', 'Monitoramento/Segurança e Alarme', 'DESPESA', 'monitoramento-seguranca', true, '2026-08-10 15:16:32.601', '2026-08-10 15:42:49.143');
INSERT INTO public."FinancialCategory" (id, name, type, "dreKey", active, "createdAt", "updatedAt") VALUES ('cmsndjpwb005a497d8j1i5ewv', 'Telefone/ Internet', 'DESPESA', 'telefone-internet', true, '2026-08-10 15:16:32.603', '2026-08-10 15:42:49.145');
INSERT INTO public."FinancialCategory" (id, name, type, "dreKey", active, "createdAt", "updatedAt") VALUES ('cmsndjpwd005b497deu07v8ea', 'Despesas com Gasolina', 'DESPESA', 'gasolina', true, '2026-08-10 15:16:32.605', '2026-08-10 15:42:49.147');
INSERT INTO public."FinancialCategory" (id, name, type, "dreKey", active, "createdAt", "updatedAt") VALUES ('cmsndjpwf005c497db4rqqj31', 'Outras Despesas Administrativas', 'DESPESA', 'outras-despesas-administrativas', true, '2026-08-10 15:16:32.607', '2026-08-10 15:42:49.148');
INSERT INTO public."FinancialCategory" (id, name, type, "dreKey", active, "createdAt", "updatedAt") VALUES ('cmsndjpwh005d497dbjyk231u', 'Encargos Sociais (INSS, FGTS, Sindicatos, etc..)', 'DESPESA', 'encargos-sociais', true, '2026-08-10 15:16:32.609', '2026-08-10 15:42:49.149');
INSERT INTO public."FinancialCategory" (id, name, type, "dreKey", active, "createdAt", "updatedAt") VALUES ('cmsndjpwj005e497d90s00zkq', 'Médico do Trabalho / Exames', 'DESPESA', 'medico-trabalho', true, '2026-08-10 15:16:32.611', '2026-08-10 15:42:49.151');
INSERT INTO public."FinancialCategory" (id, name, type, "dreKey", active, "createdAt", "updatedAt") VALUES ('cmsndjpwn005f497ditjcaoah', 'Salários Fixos + Vale refeição', 'DESPESA', 'salarios-fixos', true, '2026-08-10 15:16:32.615', '2026-08-10 15:42:49.152');
INSERT INTO public."FinancialCategory" (id, name, type, "dreKey", active, "createdAt", "updatedAt") VALUES ('cmsndjpwo005g497d4h7z6ha0', 'Free e extras', 'DESPESA', 'free-extras', true, '2026-08-10 15:16:32.616', '2026-08-10 15:42:49.153');
INSERT INTO public."FinancialCategory" (id, name, type, "dreKey", active, "createdAt", "updatedAt") VALUES ('cmsndjpwq005h497dhftt3isq', 'Antecipações', 'DESPESA', 'antecipacoes', true, '2026-08-10 15:16:32.618', '2026-08-10 15:42:49.155');
INSERT INTO public."FinancialCategory" (id, name, type, "dreKey", active, "createdAt", "updatedAt") VALUES ('cmsndjpwr005i497dgb4e965a', 'Pró-Labore', 'DESPESA', 'pro-labore', true, '2026-08-10 15:16:32.619', '2026-08-10 15:42:49.156');
INSERT INTO public."FinancialCategory" (id, name, type, "dreKey", active, "createdAt", "updatedAt") VALUES ('cmsndjpwt005j497d7febecto', 'Aniversários Funcionários', 'DESPESA', 'aniversarios-funcionarios', true, '2026-08-10 15:16:32.621', '2026-08-10 15:42:49.157');
INSERT INTO public."FinancialCategory" (id, name, type, "dreKey", active, "createdAt", "updatedAt") VALUES ('cmsndjpwu005k497dvjbohgg9', 'Nutricionista', 'DESPESA', 'nutricionista', true, '2026-08-10 15:16:32.622', '2026-08-10 15:42:49.159');
INSERT INTO public."FinancialCategory" (id, name, type, "dreKey", active, "createdAt", "updatedAt") VALUES ('cmsndjpww005l497d7ipos8wl', 'Massagem', 'DESPESA', 'massagem', true, '2026-08-10 15:16:32.624', '2026-08-10 15:42:49.16');
INSERT INTO public."FinancialCategory" (id, name, type, "dreKey", active, "createdAt", "updatedAt") VALUES ('cmsndjpwx005m497dm3aiaoee', 'Bonificação', 'DESPESA', 'bonificacao', true, '2026-08-10 15:16:32.625', '2026-08-10 15:42:49.162');
INSERT INTO public."FinancialCategory" (id, name, type, "dreKey", active, "createdAt", "updatedAt") VALUES ('cmsndjpwy005n497dvq8jg000', 'Confraternização', 'DESPESA', 'confraternizacao', true, '2026-08-10 15:16:32.626', '2026-08-10 15:42:49.163');
INSERT INTO public."FinancialCategory" (id, name, type, "dreKey", active, "createdAt", "updatedAt") VALUES ('cmsndjpx0005o497dtvonryex', 'Uniforme', 'DESPESA', 'uniforme', true, '2026-08-10 15:16:32.628', '2026-08-10 15:42:49.165');
INSERT INTO public."FinancialCategory" (id, name, type, "dreKey", active, "createdAt", "updatedAt") VALUES ('cmsndjpx2005q497drwdshtbh', 'Vale Transporte', 'DESPESA', 'vale-transporte', true, '2026-08-10 15:16:32.63', '2026-08-10 15:42:49.167');
INSERT INTO public."FinancialCategory" (id, name, type, "dreKey", active, "createdAt", "updatedAt") VALUES ('cmsndjpx3005r497dzfk35c7e', 'PROVISÃO 13º', 'DESPESA', 'provisao-13', true, '2026-08-10 15:16:32.631', '2026-08-10 15:42:49.169');
INSERT INTO public."FinancialCategory" (id, name, type, "dreKey", active, "createdAt", "updatedAt") VALUES ('cmsndjpx5005s497dv8q8avuh', 'Férias', 'DESPESA', 'ferias', true, '2026-08-10 15:16:32.633', '2026-08-10 15:42:49.171');
INSERT INTO public."FinancialCategory" (id, name, type, "dreKey", active, "createdAt", "updatedAt") VALUES ('cmsndjpx6005t497di5g0x76w', 'Outras Despesas com Pessoal', 'DESPESA', 'outras-despesas-pessoal', true, '2026-08-10 15:16:32.634', '2026-08-10 15:42:49.172');
INSERT INTO public."FinancialCategory" (id, name, type, "dreKey", active, "createdAt", "updatedAt") VALUES ('cmsndjpx7005u497dsq2pminx', 'Serviços de Marketing + Tráfego pago', 'DESPESA', 'servicos-marketing', true, '2026-08-10 15:16:32.635', '2026-08-10 15:42:49.174');
INSERT INTO public."FinancialCategory" (id, name, type, "dreKey", active, "createdAt", "updatedAt") VALUES ('cmsndjpx9005v497dyrovr0mx', 'Fiado - Influencer', 'DESPESA', 'fiado-influencer', true, '2026-08-10 15:16:32.637', '2026-08-10 15:42:49.175');
INSERT INTO public."FinancialCategory" (id, name, type, "dreKey", active, "createdAt", "updatedAt") VALUES ('cmsndjpxb005w497dgx9x7sq9', 'Ads Online', 'DESPESA', 'ads-online', true, '2026-08-10 15:16:32.639', '2026-08-10 15:42:49.177');
INSERT INTO public."FinancialCategory" (id, name, type, "dreKey", active, "createdAt", "updatedAt") VALUES ('cmsndjpxc005x497d02npfigy', 'Custos com Ações Offline', 'DESPESA', 'acoes-offline', true, '2026-08-10 15:16:32.64', '2026-08-10 15:42:49.178');
INSERT INTO public."FinancialCategory" (id, name, type, "dreKey", active, "createdAt", "updatedAt") VALUES ('cmsndjpxe005y497dtje6q83j', 'Juros', 'DESPESA', 'juros', true, '2026-08-10 15:16:32.642', '2026-08-10 15:42:49.18');
INSERT INTO public."FinancialCategory" (id, name, type, "dreKey", active, "createdAt", "updatedAt") VALUES ('cmsndjpxf005z497dztaujsw7', 'Tarifas Bancárias', 'DESPESA', 'tarifas-bancarias', true, '2026-08-10 15:16:32.643', '2026-08-10 15:42:49.181');
INSERT INTO public."FinancialCategory" (id, name, type, "dreKey", active, "createdAt", "updatedAt") VALUES ('cmsndjpxh0060497dqk6swiik', 'Vendas', 'RECEITA', 'vendas-ativo', true, '2026-08-10 15:16:32.645', '2026-08-10 15:42:49.183');
INSERT INTO public."FinancialCategory" (id, name, type, "dreKey", active, "createdAt", "updatedAt") VALUES ('cmsndjptr0042497d1snjwuto', 'Faturamento de Produtos Restaurante', 'RECEITA', 'faturamento-produtos', true, '2026-08-10 15:16:32.512', '2026-08-10 15:42:49.071');
INSERT INTO public."FinancialCategory" (id, name, type, "dreKey", active, "createdAt", "updatedAt") VALUES ('cmsndjpv9004s497dmb21x8np', 'Balanço de Estoque Embalagem', 'CUSTO', 'balanco-estoque-embalagem', true, '2026-08-10 15:16:32.565', '2026-08-10 15:42:49.115');
INSERT INTO public."FinancialCategory" (id, name, type, "dreKey", active, "createdAt", "updatedAt") VALUES ('cmsndjpx1005p497dicbpm7l3', 'Alimentação funcionários (lanche, reunião)', 'DESPESA', 'alimentacao-funcionarios', true, '2026-08-10 15:16:32.629', '2026-08-10 15:42:49.166');
INSERT INTO public."FinancialCategory" (id, name, type, "dreKey", active, "createdAt", "updatedAt") VALUES ('cmsndjpxi0061497d353azyjy', 'Empréstimos e aportes', 'RECEITA', 'emprestimos-aportes', true, '2026-08-10 15:16:32.646', '2026-08-10 15:42:49.184');
INSERT INTO public."FinancialCategory" (id, name, type, "dreKey", active, "createdAt", "updatedAt") VALUES ('cmsndjpxk0062497dtnwzj7af', 'Dívidas Passadas', 'DESPESA', 'dividas-passadas', true, '2026-08-10 15:16:32.648', '2026-08-10 15:42:49.186');
INSERT INTO public."FinancialCategory" (id, name, type, "dreKey", active, "createdAt", "updatedAt") VALUES ('cmsndjpxm0063497dd8r3zjpc', 'Empréstimos', 'DESPESA', 'emprestimos-pagamento', true, '2026-08-10 15:16:32.65', '2026-08-10 15:42:49.187');
INSERT INTO public."FinancialCategory" (id, name, type, "dreKey", active, "createdAt", "updatedAt") VALUES ('cmsndjpxo0064497dj2x8p04s', 'Equipamentos e Maquinários', 'INVESTIMENTO', 'equipamentos-maquinarios', true, '2026-08-10 15:16:32.652', '2026-08-10 15:42:49.189');
INSERT INTO public."FinancialCategory" (id, name, type, "dreKey", active, "createdAt", "updatedAt") VALUES ('cmsndjpxq0065497d4r7g8qm8', 'Reformas e benfeitorias', 'INVESTIMENTO', 'reformas-benfeitorias', true, '2026-08-10 15:16:32.654', '2026-08-10 15:42:49.191');
INSERT INTO public."FinancialCategory" (id, name, type, "dreKey", active, "createdAt", "updatedAt") VALUES ('cmsndjpxr0066497dlz3tbhcu', 'Rescisões', 'DESPESA', 'rescisoes', true, '2026-08-10 15:16:32.655', '2026-08-10 15:42:49.192');
INSERT INTO public."FinancialCategory" (id, name, type, "dreKey", active, "createdAt", "updatedAt") VALUES ('cmsndjpxt0067497dy5b6hr7m', 'Outras Despesas Não Operacionais', 'DESPESA', 'outras-despesas-nao-operacionais', true, '2026-08-10 15:16:32.657', '2026-08-10 15:42:49.194');
INSERT INTO public."FinancialCategory" (id, name, type, "dreKey", active, "createdAt", "updatedAt") VALUES ('cmsndjpxu0068497dirb7teq4', 'Retirada de Sócios / Divisão de Lucros', 'DESPESA', 'divisao-lucros-item', true, '2026-08-10 15:16:32.658', '2026-08-10 15:42:49.195');


--
-- Data for Name: Goal; Type: TABLE DATA; Schema: public; Owner: portal
--

INSERT INTO public."Goal" (id, "empresaId", name, category, responsavel, description, indicador, "valorMeta", "valorRealizado", unidade, "startDate", "endDate", bonificacao, status, observacoes, "planoDeAcao", "createdById", "createdAt", "updatedAt") VALUES ('cmsndjpr4003b497dnpztmkbv', 'cmsndjpe00000497dhfcr8mzd', 'Faturamento mensal', 'GERENCIA', 'Gerente Nord', NULL, 'Faturamento', 130000, 78000, 'R$', '2026-08-01 00:00:00', '2026-08-31 00:00:00', 'R$ 500,00 para a equipe', 'EM_ANDAMENTO', NULL, NULL, 'cmsndjph70002497dqw8826yk', '2026-08-10 15:16:32.416', '2026-08-10 15:16:32.416');
INSERT INTO public."Goal" (id, "empresaId", name, category, responsavel, description, indicador, "valorMeta", "valorRealizado", unidade, "startDate", "endDate", bonificacao, status, observacoes, "planoDeAcao", "createdById", "createdAt", "updatedAt") VALUES ('cmsndjpr4003c497dy86otvdd', 'cmsndjpe00000497dhfcr8mzd', 'Reduzir tempo de atendimento no salão', 'SALAO', 'Supervisor Salão', NULL, 'Minutos por mesa', 25, 29, 'min', '2026-08-01 00:00:00', '2026-08-31 00:00:00', NULL, 'EM_RISCO', NULL, NULL, 'cmsndjph70002497dqw8826yk', '2026-08-10 15:16:32.416', '2026-08-10 15:16:32.416');
INSERT INTO public."Goal" (id, "empresaId", name, category, responsavel, description, indicador, "valorMeta", "valorRealizado", unidade, "startDate", "endDate", bonificacao, status, observacoes, "planoDeAcao", "createdById", "createdAt", "updatedAt") VALUES ('cmsndjpr4003d497dvgit56b6', 'cmsndjpe00000497dhfcr8mzd', 'Reduzir CMV médio', 'COZINHA', 'Chef de Cozinha', NULL, 'CMV %', 30, 32, '%', '2026-08-01 00:00:00', '2026-08-31 00:00:00', NULL, 'EM_ANDAMENTO', NULL, NULL, 'cmsndjph70002497dqw8826yk', '2026-08-10 15:16:32.416', '2026-08-10 15:16:32.416');
INSERT INTO public."Goal" (id, "empresaId", name, category, responsavel, description, indicador, "valorMeta", "valorRealizado", unidade, "startDate", "endDate", bonificacao, status, observacoes, "planoDeAcao", "createdById", "createdAt", "updatedAt") VALUES ('cmsndjpr4003e497d7xuqy59r', 'cmsndjpe00000497dhfcr8mzd', 'Tempo médio de entrega', 'DELIVERY', 'Coordenador Delivery', NULL, 'Minutos', 35, 33, 'min', '2026-08-01 00:00:00', '2026-08-31 00:00:00', NULL, 'CONCLUIDA', NULL, NULL, 'cmsndjph70002497dqw8826yk', '2026-08-10 15:16:32.416', '2026-08-10 15:16:32.416');
INSERT INTO public."Goal" (id, "empresaId", name, category, responsavel, description, indicador, "valorMeta", "valorRealizado", unidade, "startDate", "endDate", bonificacao, status, observacoes, "planoDeAcao", "createdById", "createdAt", "updatedAt") VALUES ('cmsndjpr4003f497df4n990n9', 'cmsndjpeg0001497dhtlyr5f9', 'Faturamento mensal', 'GERENCIA', 'Gerente Zarki', NULL, 'Faturamento', 100000, 61000, 'R$', '2026-08-01 00:00:00', '2026-08-31 00:00:00', NULL, 'EM_ANDAMENTO', NULL, NULL, 'cmsndjph70002497dqw8826yk', '2026-08-10 15:16:32.416', '2026-08-10 15:16:32.416');
INSERT INTO public."Goal" (id, "empresaId", name, category, responsavel, description, indicador, "valorMeta", "valorRealizado", unidade, "startDate", "endDate", bonificacao, status, observacoes, "planoDeAcao", "createdById", "createdAt", "updatedAt") VALUES ('cmsndjpr4003g497dq2zhvls5', 'cmsndjpeg0001497dhtlyr5f9', 'Reduzir CMV médio', 'COZINHA', 'Chef Zarki', NULL, 'CMV %', 35, 37, '%', '2026-08-01 00:00:00', '2026-08-31 00:00:00', NULL, 'EM_RISCO', NULL, NULL, 'cmsndjph70002497dqw8826yk', '2026-08-10 15:16:32.416', '2026-08-10 15:16:32.416');


--
-- Data for Name: GoalAttachment; Type: TABLE DATA; Schema: public; Owner: portal
--



--
-- Data for Name: Ingredient; Type: TABLE DATA; Schema: public; Owner: portal
--

INSERT INTO public."Ingredient" (id, "empresaId", name, fornecedor, unidade, "precoAtual", "quantidadeEmbalagem", "percentualPerda", "estoqueMinimo", "estoqueAtual", "lastPurchaseDate", "createdAt", "updatedAt") VALUES ('cmsndjps6003o497dxlfzenza', 'cmsndjpe00000497dhfcr8mzd', 'Farinha de Trigo', 'Moinho Sul', 'kg', 5.2, 25, 0, 20, 80, NULL, '2026-08-10 15:16:32.454', '2026-08-10 15:16:32.454');
INSERT INTO public."Ingredient" (id, "empresaId", name, fornecedor, unidade, "precoAtual", "quantidadeEmbalagem", "percentualPerda", "estoqueMinimo", "estoqueAtual", "lastPurchaseDate", "createdAt", "updatedAt") VALUES ('cmsndjps9003p497d0vqtjqza', 'cmsndjpe00000497dhfcr8mzd', 'Mussarela', 'Laticínios Nord', 'kg', 32.9, 5, 0, 10, 18, NULL, '2026-08-10 15:16:32.457', '2026-08-10 15:16:32.457');
INSERT INTO public."Ingredient" (id, "empresaId", name, fornecedor, unidade, "precoAtual", "quantidadeEmbalagem", "percentualPerda", "estoqueMinimo", "estoqueAtual", "lastPurchaseDate", "createdAt", "updatedAt") VALUES ('cmsndjpsb003q497drnr849pa', 'cmsndjpe00000497dhfcr8mzd', 'Molho de Tomate', 'Hortifruti Central', 'kg', 8.5, 5, 0, 8, 15, NULL, '2026-08-10 15:16:32.459', '2026-08-10 15:16:32.459');
INSERT INTO public."Ingredient" (id, "empresaId", name, fornecedor, unidade, "precoAtual", "quantidadeEmbalagem", "percentualPerda", "estoqueMinimo", "estoqueAtual", "lastPurchaseDate", "createdAt", "updatedAt") VALUES ('cmsndjptc003v497dqloety16', 'cmsndjpeg0001497dhtlyr5f9', 'Salmão Fresco', 'Salmão Brasil', 'kg', 68, 1, 0, 5, 12, NULL, '2026-08-10 15:16:32.496', '2026-08-10 15:16:32.496');
INSERT INTO public."Ingredient" (id, "empresaId", name, fornecedor, unidade, "precoAtual", "quantidadeEmbalagem", "percentualPerda", "estoqueMinimo", "estoqueAtual", "lastPurchaseDate", "createdAt", "updatedAt") VALUES ('cmsndjpte003w497dnv08d4tp', 'cmsndjpeg0001497dhtlyr5f9', 'Arroz para Sushi', 'Distribuidora Oriental', 'kg', 12, 5, 0, 10, 25, NULL, '2026-08-10 15:16:32.498', '2026-08-10 15:16:32.498');
INSERT INTO public."Ingredient" (id, "empresaId", name, fornecedor, unidade, "precoAtual", "quantidadeEmbalagem", "percentualPerda", "estoqueMinimo", "estoqueAtual", "lastPurchaseDate", "createdAt", "updatedAt") VALUES ('cmsndjpth003x497dmncmzst2', 'cmsndjpeg0001497dhtlyr5f9', 'Alga Nori', 'Distribuidora Oriental', 'un', 1.8, 50, 0, 30, 90, NULL, '2026-08-10 15:16:32.501', '2026-08-10 15:16:32.501');


--
-- Data for Name: IngredientPriceHistory; Type: TABLE DATA; Schema: public; Owner: portal
--



--
-- Data for Name: MarketingEntry; Type: TABLE DATA; Schema: public; Owner: portal
--

INSERT INTO public."MarketingEntry" (id, "empresaId", date, "investimentoTrafego", "receitaTrafego", "pedidosCampanha", "visitasSite", conversoes, "seguidoresInicio", "seguidoresFim", curtidas, comentarios, compartilhamentos, salvamentos, alcance, impressoes, observacoes, "planoDeAcao", "createdById", "createdAt", "updatedAt") VALUES ('cmsndjpps002z497dttte209y', 'cmsndjpe00000497dhfcr8mzd', '2026-03-01 00:00:00', 1153, 3830, 81, 4424, 135, 8600, 8780, 952, 95, 152, 190, 19044, 34279, NULL, NULL, 'cmsndjph70002497dqw8826yk', '2026-08-10 15:16:32.368', '2026-08-10 15:16:32.368');
INSERT INTO public."MarketingEntry" (id, "empresaId", date, "investimentoTrafego", "receitaTrafego", "pedidosCampanha", "visitasSite", conversoes, "seguidoresInicio", "seguidoresFim", curtidas, comentarios, compartilhamentos, salvamentos, alcance, impressoes, observacoes, "planoDeAcao", "createdById", "createdAt", "updatedAt") VALUES ('cmsndjppz0030497dfquvbipu', 'cmsndjpe00000497dhfcr8mzd', '2026-04-01 00:00:00', 946, 2893, 85, 3660, 142, 8480, 8660, 1121, 112, 179, 224, 22429, 40372, NULL, NULL, 'cmsndjph70002497dqw8826yk', '2026-08-10 15:16:32.375', '2026-08-10 15:16:32.375');
INSERT INTO public."MarketingEntry" (id, "empresaId", date, "investimentoTrafego", "receitaTrafego", "pedidosCampanha", "visitasSite", conversoes, "seguidoresInicio", "seguidoresFim", curtidas, comentarios, compartilhamentos, salvamentos, alcance, impressoes, observacoes, "planoDeAcao", "createdById", "createdAt", "updatedAt") VALUES ('cmsndjpq20031497ddva9fgqs', 'cmsndjpe00000497dhfcr8mzd', '2026-05-01 00:00:00', 1365, 4950, 62, 4978, 104, 8360, 8540, 964, 96, 154, 193, 19289, 34720, NULL, NULL, 'cmsndjph70002497dqw8826yk', '2026-08-10 15:16:32.378', '2026-08-10 15:16:32.378');
INSERT INTO public."MarketingEntry" (id, "empresaId", date, "investimentoTrafego", "receitaTrafego", "pedidosCampanha", "visitasSite", conversoes, "seguidoresInicio", "seguidoresFim", curtidas, comentarios, compartilhamentos, salvamentos, alcance, impressoes, observacoes, "planoDeAcao", "createdById", "createdAt", "updatedAt") VALUES ('cmsndjpq50032497dw430kmx1', 'cmsndjpe00000497dhfcr8mzd', '2026-06-01 00:00:00', 1013, 3279, 128, 4371, 213, 8240, 8420, 1047, 105, 168, 209, 20943, 37697, NULL, NULL, 'cmsndjph70002497dqw8826yk', '2026-08-10 15:16:32.381', '2026-08-10 15:16:32.381');
INSERT INTO public."MarketingEntry" (id, "empresaId", date, "investimentoTrafego", "receitaTrafego", "pedidosCampanha", "visitasSite", conversoes, "seguidoresInicio", "seguidoresFim", curtidas, comentarios, compartilhamentos, salvamentos, alcance, impressoes, observacoes, "planoDeAcao", "createdById", "createdAt", "updatedAt") VALUES ('cmsndjpq80033497d3ixqiaet', 'cmsndjpe00000497dhfcr8mzd', '2026-07-01 00:00:00', 1323, 3593, 49, 3992, 82, 8120, 8300, 846, 85, 135, 169, 16918, 30452, NULL, NULL, 'cmsndjph70002497dqw8826yk', '2026-08-10 15:16:32.384', '2026-08-10 15:16:32.384');
INSERT INTO public."MarketingEntry" (id, "empresaId", date, "investimentoTrafego", "receitaTrafego", "pedidosCampanha", "visitasSite", conversoes, "seguidoresInicio", "seguidoresFim", curtidas, comentarios, compartilhamentos, salvamentos, alcance, impressoes, observacoes, "planoDeAcao", "createdById", "createdAt", "updatedAt") VALUES ('cmsndjpqa0034497d505zgjn6', 'cmsndjpe00000497dhfcr8mzd', '2026-08-01 00:00:00', 1369, 6143, 32, 2389, 53, 8000, 9020, 918, 92, 147, 184, 18358, 33044, NULL, NULL, 'cmsndjph70002497dqw8826yk', '2026-08-10 15:16:32.386', '2026-08-10 15:16:32.386');
INSERT INTO public."MarketingEntry" (id, "empresaId", date, "investimentoTrafego", "receitaTrafego", "pedidosCampanha", "visitasSite", conversoes, "seguidoresInicio", "seguidoresFim", curtidas, comentarios, compartilhamentos, salvamentos, alcance, impressoes, observacoes, "planoDeAcao", "createdById", "createdAt", "updatedAt") VALUES ('cmsndjpqc0035497dk0ut7vx3', 'cmsndjpeg0001497dhtlyr5f9', '2026-03-01 00:00:00', 1170, 4450, 78, 4009, 130, 8600, 8780, 833, 83, 133, 167, 16658, 29984, NULL, NULL, 'cmsndjph70002497dqw8826yk', '2026-08-10 15:16:32.388', '2026-08-10 15:16:32.388');
INSERT INTO public."MarketingEntry" (id, "empresaId", date, "investimentoTrafego", "receitaTrafego", "pedidosCampanha", "visitasSite", conversoes, "seguidoresInicio", "seguidoresFim", curtidas, comentarios, compartilhamentos, salvamentos, alcance, impressoes, observacoes, "planoDeAcao", "createdById", "createdAt", "updatedAt") VALUES ('cmsndjpqf0036497dds0e0497', 'cmsndjpeg0001497dhtlyr5f9', '2026-04-01 00:00:00', 1351, 5713, 56, 2166, 93, 8480, 8660, 982, 98, 157, 196, 19639, 35350, NULL, NULL, 'cmsndjph70002497dqw8826yk', '2026-08-10 15:16:32.391', '2026-08-10 15:16:32.391');
INSERT INTO public."MarketingEntry" (id, "empresaId", date, "investimentoTrafego", "receitaTrafego", "pedidosCampanha", "visitasSite", conversoes, "seguidoresInicio", "seguidoresFim", curtidas, comentarios, compartilhamentos, salvamentos, alcance, impressoes, observacoes, "planoDeAcao", "createdById", "createdAt", "updatedAt") VALUES ('cmsndjpqh0037497d954ioa2u', 'cmsndjpeg0001497dhtlyr5f9', '2026-05-01 00:00:00', 1080, 4366, 77, 4864, 128, 8360, 8540, 925, 92, 148, 185, 18499, 33298, NULL, NULL, 'cmsndjph70002497dqw8826yk', '2026-08-10 15:16:32.393', '2026-08-10 15:16:32.393');
INSERT INTO public."MarketingEntry" (id, "empresaId", date, "investimentoTrafego", "receitaTrafego", "pedidosCampanha", "visitasSite", conversoes, "seguidoresInicio", "seguidoresFim", curtidas, comentarios, compartilhamentos, salvamentos, alcance, impressoes, observacoes, "planoDeAcao", "createdById", "createdAt", "updatedAt") VALUES ('cmsndjpqk0038497d7l65lahm', 'cmsndjpeg0001497dhtlyr5f9', '2026-06-01 00:00:00', 1214, 3927, 55, 2082, 92, 8240, 8420, 931, 93, 149, 186, 18627, 33529, NULL, NULL, 'cmsndjph70002497dqw8826yk', '2026-08-10 15:16:32.396', '2026-08-10 15:16:32.396');
INSERT INTO public."MarketingEntry" (id, "empresaId", date, "investimentoTrafego", "receitaTrafego", "pedidosCampanha", "visitasSite", conversoes, "seguidoresInicio", "seguidoresFim", curtidas, comentarios, compartilhamentos, salvamentos, alcance, impressoes, observacoes, "planoDeAcao", "createdById", "createdAt", "updatedAt") VALUES ('cmsndjpqm0039497d08nf34zj', 'cmsndjpeg0001497dhtlyr5f9', '2026-07-01 00:00:00', 1121, 3144, 35, 2546, 58, 8120, 8300, 861, 86, 138, 172, 17211, 30980, NULL, NULL, 'cmsndjph70002497dqw8826yk', '2026-08-10 15:16:32.398', '2026-08-10 15:16:32.398');
INSERT INTO public."MarketingEntry" (id, "empresaId", date, "investimentoTrafego", "receitaTrafego", "pedidosCampanha", "visitasSite", conversoes, "seguidoresInicio", "seguidoresFim", curtidas, comentarios, compartilhamentos, salvamentos, alcance, impressoes, observacoes, "planoDeAcao", "createdById", "createdAt", "updatedAt") VALUES ('cmsndjpqq003a497dtd7qhp0q', 'cmsndjpeg0001497dhtlyr5f9', '2026-08-01 00:00:00', 863, 2240, 58, 4612, 97, 8000, 9020, 896, 90, 143, 179, 17911, 32240, NULL, NULL, 'cmsndjph70002497dqw8826yk', '2026-08-10 15:16:32.402', '2026-08-10 15:16:32.402');


--
-- Data for Name: MenuPreference; Type: TABLE DATA; Schema: public; Owner: portal
--



--
-- Data for Name: Occurrence; Type: TABLE DATA; Schema: public; Owner: portal
--

INSERT INTO public."Occurrence" (id, "employeeId", date, type, "horarioPrevisto", "horarioRealizado", "minutosAtraso", justificativa, "anexoUrl", observacao, status, "createdById", "createdAt") VALUES ('cmsndjprx003m497dwextzyhm', 'cmsndjprp003i497d9wqc95ut', '2026-08-05 00:00:00', 'ATRASO', '17:00', '17:20', 20, 'Trânsito', NULL, NULL, 'JUSTIFICADA', 'cmsndjph70002497dqw8826yk', '2026-08-10 15:16:32.445');
INSERT INTO public."Occurrence" (id, "employeeId", date, type, "horarioPrevisto", "horarioRealizado", "minutosAtraso", justificativa, "anexoUrl", observacao, status, "createdById", "createdAt") VALUES ('cmsndjps1003n497dy7g6ar7f', 'cmsndjprn003h497dyodbndf7', '2026-08-12 00:00:00', 'FALTA', NULL, NULL, 0, NULL, NULL, NULL, 'NAO_JUSTIFICADA', 'cmsndjph70002497dqw8826yk', '2026-08-10 15:16:32.449');


--
-- Data for Name: RecurringTemplate; Type: TABLE DATA; Schema: public; Owner: portal
--



--
-- Data for Name: Payable; Type: TABLE DATA; Schema: public; Owner: portal
--



--
-- Data for Name: Product; Type: TABLE DATA; Schema: public; Owner: portal
--

INSERT INTO public."Product" (id, "empresaId", name, code, category, "photoUrl", description, rendimento, tamanho, "pesoFinal", "precoVenda", "modoPreparo", "tempoPreparo", validade, responsavel, "createdById", "createdAt", "updatedAt") VALUES ('cmsndjpt4003r497dtog12h8f', 'cmsndjpe00000497dhfcr8mzd', 'Pizza Mussarela', 'PZ-001', 'PIZZA_SALGADA', NULL, NULL, '8 fatias', 'Grande (35cm)', NULL, 55, NULL, 25, NULL, 'Chef de Cozinha', 'cmsndjph70002497dqw8826yk', '2026-08-10 15:16:32.488', '2026-08-10 15:16:32.488');
INSERT INTO public."Product" (id, "empresaId", name, code, category, "photoUrl", description, rendimento, tamanho, "pesoFinal", "precoVenda", "modoPreparo", "tempoPreparo", validade, responsavel, "createdById", "createdAt", "updatedAt") VALUES ('cmsndjptm003y497dbaqc7lvl', 'cmsndjpeg0001497dhtlyr5f9', 'Combo Salmão 20 peças', 'SK-001', 'COMBO', NULL, NULL, '20 peças', NULL, NULL, 89, NULL, 20, NULL, 'Chef Zarki', 'cmsndjph70002497dqw8826yk', '2026-08-10 15:16:32.506', '2026-08-10 15:16:32.506');


--
-- Data for Name: ProductIngredient; Type: TABLE DATA; Schema: public; Owner: portal
--

INSERT INTO public."ProductIngredient" (id, "productId", "ingredientId", "quantidadeUsada", "percentualPerda") VALUES ('cmsndjpt7003s497dyw2nblgq', 'cmsndjpt4003r497dtog12h8f', 'cmsndjps6003o497dxlfzenza', 0.4, 3);
INSERT INTO public."ProductIngredient" (id, "productId", "ingredientId", "quantidadeUsada", "percentualPerda") VALUES ('cmsndjpt7003t497dz9e5g5rx', 'cmsndjpt4003r497dtog12h8f', 'cmsndjps9003p497d0vqtjqza', 0.3, 2);
INSERT INTO public."ProductIngredient" (id, "productId", "ingredientId", "quantidadeUsada", "percentualPerda") VALUES ('cmsndjpt7003u497d60my2a6j', 'cmsndjpt4003r497dtog12h8f', 'cmsndjpsb003q497drnr849pa', 0.15, 1);
INSERT INTO public."ProductIngredient" (id, "productId", "ingredientId", "quantidadeUsada", "percentualPerda") VALUES ('cmsndjptn003z497d03tkokl8', 'cmsndjptm003y497dbaqc7lvl', 'cmsndjptc003v497dqloety16', 0.3, 5);
INSERT INTO public."ProductIngredient" (id, "productId", "ingredientId", "quantidadeUsada", "percentualPerda") VALUES ('cmsndjptn0040497dh31u3ou9', 'cmsndjptm003y497dbaqc7lvl', 'cmsndjpte003w497dnv08d4tp', 0.4, 2);
INSERT INTO public."ProductIngredient" (id, "productId", "ingredientId", "quantidadeUsada", "percentualPerda") VALUES ('cmsndjptn0041497daf2tfiie', 'cmsndjptm003y497dbaqc7lvl', 'cmsndjpth003x497dmncmzst2', 10, 0);


--
-- Data for Name: Receivable; Type: TABLE DATA; Schema: public; Owner: portal
--



--
-- Data for Name: SalesEntry; Type: TABLE DATA; Schema: public; Owner: portal
--

INSERT INTO public."SalesEntry" (id, "empresaId", date, "periodType", "faturamentoDelivery", "faturamentoSalao", "pedidosDelivery", "pedidosBalcao", "pedidosSalao", "mesasAtendidas", "taxaServicoValor", "metaDiaria", observacoes, "createdById", "createdAt", "updatedAt") VALUES ('cmsndjpm7001b497d4jjjsx4q', 'cmsndjpe00000497dhfcr8mzd', '2026-07-12 15:16:32.233', 'DIARIO', 2507, 2052, 39, 4, 22, 16, 205, 4200, NULL, 'cmsndjph70002497dqw8826yk', '2026-08-10 15:16:32.239', '2026-08-10 15:16:32.239');
INSERT INTO public."SalesEntry" (id, "empresaId", date, "periodType", "faturamentoDelivery", "faturamentoSalao", "pedidosDelivery", "pedidosBalcao", "pedidosSalao", "mesasAtendidas", "taxaServicoValor", "metaDiaria", observacoes, "createdById", "createdAt", "updatedAt") VALUES ('cmsndjpma001c497dwyxlh9sj', 'cmsndjpe00000497dhfcr8mzd', '2026-07-13 15:16:32.233', 'DIARIO', 2691, 2202, 41, 5, 23, 17, 220, 4200, NULL, 'cmsndjph70002497dqw8826yk', '2026-08-10 15:16:32.242', '2026-08-10 15:16:32.242');
INSERT INTO public."SalesEntry" (id, "empresaId", date, "periodType", "faturamentoDelivery", "faturamentoSalao", "pedidosDelivery", "pedidosBalcao", "pedidosSalao", "mesasAtendidas", "taxaServicoValor", "metaDiaria", observacoes, "createdById", "createdAt", "updatedAt") VALUES ('cmsndjpmb001d497d9vr2ajq4', 'cmsndjpe00000497dhfcr8mzd', '2026-07-14 15:16:32.233', 'DIARIO', 2686, 2197, 41, 2, 23, 17, 220, 4200, NULL, 'cmsndjph70002497dqw8826yk', '2026-08-10 15:16:32.243', '2026-08-10 15:16:32.243');
INSERT INTO public."SalesEntry" (id, "empresaId", date, "periodType", "faturamentoDelivery", "faturamentoSalao", "pedidosDelivery", "pedidosBalcao", "pedidosSalao", "mesasAtendidas", "taxaServicoValor", "metaDiaria", observacoes, "createdById", "createdAt", "updatedAt") VALUES ('cmsndjpmd001e497dvzbilfax', 'cmsndjpe00000497dhfcr8mzd', '2026-07-15 15:16:32.233', 'DIARIO', 2036, 1666, 31, 1, 18, 13, 167, 4200, NULL, 'cmsndjph70002497dqw8826yk', '2026-08-10 15:16:32.245', '2026-08-10 15:16:32.245');
INSERT INTO public."SalesEntry" (id, "empresaId", date, "periodType", "faturamentoDelivery", "faturamentoSalao", "pedidosDelivery", "pedidosBalcao", "pedidosSalao", "mesasAtendidas", "taxaServicoValor", "metaDiaria", observacoes, "createdById", "createdAt", "updatedAt") VALUES ('cmsndjpmf001f497dyvb9jg8m', 'cmsndjpe00000497dhfcr8mzd', '2026-07-16 15:16:32.233', 'DIARIO', 2053, 1680, 32, 7, 18, 13, 168, 4200, NULL, 'cmsndjph70002497dqw8826yk', '2026-08-10 15:16:32.247', '2026-08-10 15:16:32.247');
INSERT INTO public."SalesEntry" (id, "empresaId", date, "periodType", "faturamentoDelivery", "faturamentoSalao", "pedidosDelivery", "pedidosBalcao", "pedidosSalao", "mesasAtendidas", "taxaServicoValor", "metaDiaria", observacoes, "createdById", "createdAt", "updatedAt") VALUES ('cmsndjpmg001g497dfg3h9ur2', 'cmsndjpe00000497dhfcr8mzd', '2026-07-17 15:16:32.233', 'DIARIO', 2496, 2042, 38, 3, 21, 16, 204, 4200, NULL, 'cmsndjph70002497dqw8826yk', '2026-08-10 15:16:32.248', '2026-08-10 15:16:32.248');
INSERT INTO public."SalesEntry" (id, "empresaId", date, "periodType", "faturamentoDelivery", "faturamentoSalao", "pedidosDelivery", "pedidosBalcao", "pedidosSalao", "mesasAtendidas", "taxaServicoValor", "metaDiaria", observacoes, "createdById", "createdAt", "updatedAt") VALUES ('cmsndjpmi001h497dkdnkq6qp', 'cmsndjpe00000497dhfcr8mzd', '2026-07-18 15:16:32.233', 'DIARIO', 2744, 2245, 42, 5, 24, 17, 225, 4200, NULL, 'cmsndjph70002497dqw8826yk', '2026-08-10 15:16:32.25', '2026-08-10 15:16:32.25');
INSERT INTO public."SalesEntry" (id, "empresaId", date, "periodType", "faturamentoDelivery", "faturamentoSalao", "pedidosDelivery", "pedidosBalcao", "pedidosSalao", "mesasAtendidas", "taxaServicoValor", "metaDiaria", observacoes, "createdById", "createdAt", "updatedAt") VALUES ('cmsndjpmk001i497dgm6bf3bt', 'cmsndjpe00000497dhfcr8mzd', '2026-07-19 15:16:32.233', 'DIARIO', 1774, 1452, 27, 0, 15, 11, 145, 4200, NULL, 'cmsndjph70002497dqw8826yk', '2026-08-10 15:16:32.252', '2026-08-10 15:16:32.252');
INSERT INTO public."SalesEntry" (id, "empresaId", date, "periodType", "faturamentoDelivery", "faturamentoSalao", "pedidosDelivery", "pedidosBalcao", "pedidosSalao", "mesasAtendidas", "taxaServicoValor", "metaDiaria", observacoes, "createdById", "createdAt", "updatedAt") VALUES ('cmsndjpml001j497djt5g9ddn', 'cmsndjpe00000497dhfcr8mzd', '2026-07-20 15:16:32.233', 'DIARIO', 1854, 1517, 29, 3, 16, 12, 152, 4200, NULL, 'cmsndjph70002497dqw8826yk', '2026-08-10 15:16:32.253', '2026-08-10 15:16:32.253');
INSERT INTO public."SalesEntry" (id, "empresaId", date, "periodType", "faturamentoDelivery", "faturamentoSalao", "pedidosDelivery", "pedidosBalcao", "pedidosSalao", "mesasAtendidas", "taxaServicoValor", "metaDiaria", observacoes, "createdById", "createdAt", "updatedAt") VALUES ('cmsndjpmn001k497d7gghryxh', 'cmsndjpe00000497dhfcr8mzd', '2026-07-21 15:16:32.233', 'DIARIO', 1836, 1502, 28, 7, 16, 12, 150, 4200, NULL, 'cmsndjph70002497dqw8826yk', '2026-08-10 15:16:32.255', '2026-08-10 15:16:32.255');
INSERT INTO public."SalesEntry" (id, "empresaId", date, "periodType", "faturamentoDelivery", "faturamentoSalao", "pedidosDelivery", "pedidosBalcao", "pedidosSalao", "mesasAtendidas", "taxaServicoValor", "metaDiaria", observacoes, "createdById", "createdAt", "updatedAt") VALUES ('cmsndjpmp001l497d9ig8hnw5', 'cmsndjpe00000497dhfcr8mzd', '2026-07-22 15:16:32.233', 'DIARIO', 1964, 1607, 30, 5, 17, 12, 161, 4200, NULL, 'cmsndjph70002497dqw8826yk', '2026-08-10 15:16:32.257', '2026-08-10 15:16:32.257');
INSERT INTO public."SalesEntry" (id, "empresaId", date, "periodType", "faturamentoDelivery", "faturamentoSalao", "pedidosDelivery", "pedidosBalcao", "pedidosSalao", "mesasAtendidas", "taxaServicoValor", "metaDiaria", observacoes, "createdById", "createdAt", "updatedAt") VALUES ('cmsndjpmr001m497dopn0xb8x', 'cmsndjpe00000497dhfcr8mzd', '2026-07-23 15:16:32.233', 'DIARIO', 2199, 1799, 34, 2, 19, 14, 180, 4200, NULL, 'cmsndjph70002497dqw8826yk', '2026-08-10 15:16:32.259', '2026-08-10 15:16:32.259');
INSERT INTO public."SalesEntry" (id, "empresaId", date, "periodType", "faturamentoDelivery", "faturamentoSalao", "pedidosDelivery", "pedidosBalcao", "pedidosSalao", "mesasAtendidas", "taxaServicoValor", "metaDiaria", observacoes, "createdById", "createdAt", "updatedAt") VALUES ('cmsndjpmu001n497d8uzose9x', 'cmsndjpe00000497dhfcr8mzd', '2026-07-24 15:16:32.233', 'DIARIO', 2315, 1894, 36, 1, 20, 15, 189, 4200, NULL, 'cmsndjph70002497dqw8826yk', '2026-08-10 15:16:32.262', '2026-08-10 15:16:32.262');
INSERT INTO public."SalesEntry" (id, "empresaId", date, "periodType", "faturamentoDelivery", "faturamentoSalao", "pedidosDelivery", "pedidosBalcao", "pedidosSalao", "mesasAtendidas", "taxaServicoValor", "metaDiaria", observacoes, "createdById", "createdAt", "updatedAt") VALUES ('cmsndjpmw001o497d2u615w8e', 'cmsndjpe00000497dhfcr8mzd', '2026-07-25 15:16:32.233', 'DIARIO', 2257, 1847, 35, 0, 19, 14, 185, 4200, NULL, 'cmsndjph70002497dqw8826yk', '2026-08-10 15:16:32.264', '2026-08-10 15:16:32.264');
INSERT INTO public."SalesEntry" (id, "empresaId", date, "periodType", "faturamentoDelivery", "faturamentoSalao", "pedidosDelivery", "pedidosBalcao", "pedidosSalao", "mesasAtendidas", "taxaServicoValor", "metaDiaria", observacoes, "createdById", "createdAt", "updatedAt") VALUES ('cmsndjpmz001p497d2cbf6b86', 'cmsndjpe00000497dhfcr8mzd', '2026-07-26 15:16:32.233', 'DIARIO', 2724, 2228, 42, 6, 23, 17, 223, 4200, NULL, 'cmsndjph70002497dqw8826yk', '2026-08-10 15:16:32.267', '2026-08-10 15:16:32.267');
INSERT INTO public."SalesEntry" (id, "empresaId", date, "periodType", "faturamentoDelivery", "faturamentoSalao", "pedidosDelivery", "pedidosBalcao", "pedidosSalao", "mesasAtendidas", "taxaServicoValor", "metaDiaria", observacoes, "createdById", "createdAt", "updatedAt") VALUES ('cmsndjpn3001q497dpvnr33bx', 'cmsndjpe00000497dhfcr8mzd', '2026-07-27 15:16:32.233', 'DIARIO', 1864, 1525, 29, 7, 16, 12, 153, 4200, NULL, 'cmsndjph70002497dqw8826yk', '2026-08-10 15:16:32.271', '2026-08-10 15:16:32.271');
INSERT INTO public."SalesEntry" (id, "empresaId", date, "periodType", "faturamentoDelivery", "faturamentoSalao", "pedidosDelivery", "pedidosBalcao", "pedidosSalao", "mesasAtendidas", "taxaServicoValor", "metaDiaria", observacoes, "createdById", "createdAt", "updatedAt") VALUES ('cmsndjpn5001r497dsgjdne5i', 'cmsndjpe00000497dhfcr8mzd', '2026-07-28 15:16:32.233', 'DIARIO', 2727, 2231, 42, 6, 23, 17, 223, 4200, NULL, 'cmsndjph70002497dqw8826yk', '2026-08-10 15:16:32.273', '2026-08-10 15:16:32.273');
INSERT INTO public."SalesEntry" (id, "empresaId", date, "periodType", "faturamentoDelivery", "faturamentoSalao", "pedidosDelivery", "pedidosBalcao", "pedidosSalao", "mesasAtendidas", "taxaServicoValor", "metaDiaria", observacoes, "createdById", "createdAt", "updatedAt") VALUES ('cmsndjpn7001s497dqg683vik', 'cmsndjpe00000497dhfcr8mzd', '2026-07-29 15:16:32.233', 'DIARIO', 2663, 2179, 41, 7, 23, 17, 218, 4200, NULL, 'cmsndjph70002497dqw8826yk', '2026-08-10 15:16:32.275', '2026-08-10 15:16:32.275');
INSERT INTO public."SalesEntry" (id, "empresaId", date, "periodType", "faturamentoDelivery", "faturamentoSalao", "pedidosDelivery", "pedidosBalcao", "pedidosSalao", "mesasAtendidas", "taxaServicoValor", "metaDiaria", observacoes, "createdById", "createdAt", "updatedAt") VALUES ('cmsndjpn9001t497dwgss18dd', 'cmsndjpe00000497dhfcr8mzd', '2026-07-30 15:16:32.233', 'DIARIO', 2140, 1751, 33, 1, 18, 13, 175, 4200, NULL, 'cmsndjph70002497dqw8826yk', '2026-08-10 15:16:32.277', '2026-08-10 15:16:32.277');
INSERT INTO public."SalesEntry" (id, "empresaId", date, "periodType", "faturamentoDelivery", "faturamentoSalao", "pedidosDelivery", "pedidosBalcao", "pedidosSalao", "mesasAtendidas", "taxaServicoValor", "metaDiaria", observacoes, "createdById", "createdAt", "updatedAt") VALUES ('cmsndjpnc001u497dytbv1auj', 'cmsndjpe00000497dhfcr8mzd', '2026-07-31 15:16:32.233', 'DIARIO', 1814, 1484, 28, 4, 16, 11, 148, 4200, NULL, 'cmsndjph70002497dqw8826yk', '2026-08-10 15:16:32.28', '2026-08-10 15:16:32.28');
INSERT INTO public."SalesEntry" (id, "empresaId", date, "periodType", "faturamentoDelivery", "faturamentoSalao", "pedidosDelivery", "pedidosBalcao", "pedidosSalao", "mesasAtendidas", "taxaServicoValor", "metaDiaria", observacoes, "createdById", "createdAt", "updatedAt") VALUES ('cmsndjpne001v497dphlug0ey', 'cmsndjpe00000497dhfcr8mzd', '2026-08-01 15:16:32.233', 'DIARIO', 2564, 2098, 39, 6, 22, 16, 210, 4200, NULL, 'cmsndjph70002497dqw8826yk', '2026-08-10 15:16:32.282', '2026-08-10 15:16:32.282');
INSERT INTO public."SalesEntry" (id, "empresaId", date, "periodType", "faturamentoDelivery", "faturamentoSalao", "pedidosDelivery", "pedidosBalcao", "pedidosSalao", "mesasAtendidas", "taxaServicoValor", "metaDiaria", observacoes, "createdById", "createdAt", "updatedAt") VALUES ('cmsndjpng001w497djde9veh1', 'cmsndjpe00000497dhfcr8mzd', '2026-08-02 15:16:32.233', 'DIARIO', 2277, 1863, 35, 7, 20, 14, 186, 4200, NULL, 'cmsndjph70002497dqw8826yk', '2026-08-10 15:16:32.284', '2026-08-10 15:16:32.284');
INSERT INTO public."SalesEntry" (id, "empresaId", date, "periodType", "faturamentoDelivery", "faturamentoSalao", "pedidosDelivery", "pedidosBalcao", "pedidosSalao", "mesasAtendidas", "taxaServicoValor", "metaDiaria", observacoes, "createdById", "createdAt", "updatedAt") VALUES ('cmsndjpnj001x497dw5fbddzw', 'cmsndjpe00000497dhfcr8mzd', '2026-08-03 15:16:32.233', 'DIARIO', 1838, 1504, 28, 0, 16, 12, 150, 4200, NULL, 'cmsndjph70002497dqw8826yk', '2026-08-10 15:16:32.287', '2026-08-10 15:16:32.287');
INSERT INTO public."SalesEntry" (id, "empresaId", date, "periodType", "faturamentoDelivery", "faturamentoSalao", "pedidosDelivery", "pedidosBalcao", "pedidosSalao", "mesasAtendidas", "taxaServicoValor", "metaDiaria", observacoes, "createdById", "createdAt", "updatedAt") VALUES ('cmsndjpnl001y497d1xuaftvg', 'cmsndjpe00000497dhfcr8mzd', '2026-08-04 15:16:32.233', 'DIARIO', 2276, 1862, 35, 0, 20, 14, 186, 4200, NULL, 'cmsndjph70002497dqw8826yk', '2026-08-10 15:16:32.289', '2026-08-10 15:16:32.289');
INSERT INTO public."SalesEntry" (id, "empresaId", date, "periodType", "faturamentoDelivery", "faturamentoSalao", "pedidosDelivery", "pedidosBalcao", "pedidosSalao", "mesasAtendidas", "taxaServicoValor", "metaDiaria", observacoes, "createdById", "createdAt", "updatedAt") VALUES ('cmsndjpnn001z497dinm4crse', 'cmsndjpe00000497dhfcr8mzd', '2026-08-05 15:16:32.233', 'DIARIO', 2303, 1884, 35, 7, 20, 14, 188, 4200, NULL, 'cmsndjph70002497dqw8826yk', '2026-08-10 15:16:32.291', '2026-08-10 15:16:32.291');
INSERT INTO public."SalesEntry" (id, "empresaId", date, "periodType", "faturamentoDelivery", "faturamentoSalao", "pedidosDelivery", "pedidosBalcao", "pedidosSalao", "mesasAtendidas", "taxaServicoValor", "metaDiaria", observacoes, "createdById", "createdAt", "updatedAt") VALUES ('cmsndjpnq0020497d3506aq6k', 'cmsndjpe00000497dhfcr8mzd', '2026-08-06 15:16:32.233', 'DIARIO', 2319, 1897, 36, 2, 20, 15, 190, 4200, NULL, 'cmsndjph70002497dqw8826yk', '2026-08-10 15:16:32.294', '2026-08-10 15:16:32.294');
INSERT INTO public."SalesEntry" (id, "empresaId", date, "periodType", "faturamentoDelivery", "faturamentoSalao", "pedidosDelivery", "pedidosBalcao", "pedidosSalao", "mesasAtendidas", "taxaServicoValor", "metaDiaria", observacoes, "createdById", "createdAt", "updatedAt") VALUES ('cmsndjpns0021497do62rero6', 'cmsndjpe00000497dhfcr8mzd', '2026-08-07 15:16:32.233', 'DIARIO', 2709, 2216, 42, 6, 23, 17, 222, 4200, NULL, 'cmsndjph70002497dqw8826yk', '2026-08-10 15:16:32.296', '2026-08-10 15:16:32.296');
INSERT INTO public."SalesEntry" (id, "empresaId", date, "periodType", "faturamentoDelivery", "faturamentoSalao", "pedidosDelivery", "pedidosBalcao", "pedidosSalao", "mesasAtendidas", "taxaServicoValor", "metaDiaria", observacoes, "createdById", "createdAt", "updatedAt") VALUES ('cmsndjpnv0022497dkg8ixhil', 'cmsndjpe00000497dhfcr8mzd', '2026-08-08 15:16:32.233', 'DIARIO', 1903, 1557, 29, 5, 16, 12, 156, 4200, NULL, 'cmsndjph70002497dqw8826yk', '2026-08-10 15:16:32.299', '2026-08-10 15:16:32.299');
INSERT INTO public."SalesEntry" (id, "empresaId", date, "periodType", "faturamentoDelivery", "faturamentoSalao", "pedidosDelivery", "pedidosBalcao", "pedidosSalao", "mesasAtendidas", "taxaServicoValor", "metaDiaria", observacoes, "createdById", "createdAt", "updatedAt") VALUES ('cmsndjpny0023497d34bz8g1s', 'cmsndjpe00000497dhfcr8mzd', '2026-08-09 15:16:32.233', 'DIARIO', 2747, 2247, 42, 7, 24, 17, 225, 4200, NULL, 'cmsndjph70002497dqw8826yk', '2026-08-10 15:16:32.302', '2026-08-10 15:16:32.302');
INSERT INTO public."SalesEntry" (id, "empresaId", date, "periodType", "faturamentoDelivery", "faturamentoSalao", "pedidosDelivery", "pedidosBalcao", "pedidosSalao", "mesasAtendidas", "taxaServicoValor", "metaDiaria", observacoes, "createdById", "createdAt", "updatedAt") VALUES ('cmsndjpo00024497dxpujr1t8', 'cmsndjpe00000497dhfcr8mzd', '2026-08-10 15:16:32.233', 'DIARIO', 1950, 1596, 30, 1, 17, 12, 160, 4200, NULL, 'cmsndjph70002497dqw8826yk', '2026-08-10 15:16:32.304', '2026-08-10 15:16:32.304');
INSERT INTO public."SalesEntry" (id, "empresaId", date, "periodType", "faturamentoDelivery", "faturamentoSalao", "pedidosDelivery", "pedidosBalcao", "pedidosSalao", "mesasAtendidas", "taxaServicoValor", "metaDiaria", observacoes, "createdById", "createdAt", "updatedAt") VALUES ('cmsndjpo30025497dily8h9lj', 'cmsndjpeg0001497dhtlyr5f9', '2026-07-12 15:16:32.233', 'DIARIO', 1465, 1199, 23, 0, 13, 9, 120, 3150, NULL, 'cmsndjph70002497dqw8826yk', '2026-08-10 15:16:32.307', '2026-08-10 15:16:32.307');
INSERT INTO public."SalesEntry" (id, "empresaId", date, "periodType", "faturamentoDelivery", "faturamentoSalao", "pedidosDelivery", "pedidosBalcao", "pedidosSalao", "mesasAtendidas", "taxaServicoValor", "metaDiaria", observacoes, "createdById", "createdAt", "updatedAt") VALUES ('cmsndjpo50026497da7p8qe9o', 'cmsndjpeg0001497dhtlyr5f9', '2026-07-13 15:16:32.233', 'DIARIO', 1970, 1611, 30, 8, 17, 12, 161, 3150, NULL, 'cmsndjph70002497dqw8826yk', '2026-08-10 15:16:32.309', '2026-08-10 15:16:32.309');
INSERT INTO public."SalesEntry" (id, "empresaId", date, "periodType", "faturamentoDelivery", "faturamentoSalao", "pedidosDelivery", "pedidosBalcao", "pedidosSalao", "mesasAtendidas", "taxaServicoValor", "metaDiaria", observacoes, "createdById", "createdAt", "updatedAt") VALUES ('cmsndjpo80027497dzju2gntp', 'cmsndjpeg0001497dhtlyr5f9', '2026-07-14 15:16:32.233', 'DIARIO', 1918, 1569, 30, 7, 17, 12, 157, 3150, NULL, 'cmsndjph70002497dqw8826yk', '2026-08-10 15:16:32.312', '2026-08-10 15:16:32.312');
INSERT INTO public."SalesEntry" (id, "empresaId", date, "periodType", "faturamentoDelivery", "faturamentoSalao", "pedidosDelivery", "pedidosBalcao", "pedidosSalao", "mesasAtendidas", "taxaServicoValor", "metaDiaria", observacoes, "createdById", "createdAt", "updatedAt") VALUES ('cmsndjpoa0028497deekdiu37', 'cmsndjpeg0001497dhtlyr5f9', '2026-07-15 15:16:32.233', 'DIARIO', 1867, 1528, 29, 2, 16, 12, 153, 3150, NULL, 'cmsndjph70002497dqw8826yk', '2026-08-10 15:16:32.314', '2026-08-10 15:16:32.314');
INSERT INTO public."SalesEntry" (id, "empresaId", date, "periodType", "faturamentoDelivery", "faturamentoSalao", "pedidosDelivery", "pedidosBalcao", "pedidosSalao", "mesasAtendidas", "taxaServicoValor", "metaDiaria", observacoes, "createdById", "createdAt", "updatedAt") VALUES ('cmsndjpoc0029497d674y5vsi', 'cmsndjpeg0001497dhtlyr5f9', '2026-07-16 15:16:32.233', 'DIARIO', 1387, 1135, 21, 4, 12, 9, 114, 3150, NULL, 'cmsndjph70002497dqw8826yk', '2026-08-10 15:16:32.316', '2026-08-10 15:16:32.316');
INSERT INTO public."SalesEntry" (id, "empresaId", date, "periodType", "faturamentoDelivery", "faturamentoSalao", "pedidosDelivery", "pedidosBalcao", "pedidosSalao", "mesasAtendidas", "taxaServicoValor", "metaDiaria", observacoes, "createdById", "createdAt", "updatedAt") VALUES ('cmsndjpoe002a497dpedtkrze', 'cmsndjpeg0001497dhtlyr5f9', '2026-07-17 15:16:32.233', 'DIARIO', 1681, 1375, 26, 2, 14, 11, 138, 3150, NULL, 'cmsndjph70002497dqw8826yk', '2026-08-10 15:16:32.318', '2026-08-10 15:16:32.318');
INSERT INTO public."SalesEntry" (id, "empresaId", date, "periodType", "faturamentoDelivery", "faturamentoSalao", "pedidosDelivery", "pedidosBalcao", "pedidosSalao", "mesasAtendidas", "taxaServicoValor", "metaDiaria", observacoes, "createdById", "createdAt", "updatedAt") VALUES ('cmsndjpoh002b497dpa7mdsnb', 'cmsndjpeg0001497dhtlyr5f9', '2026-07-18 15:16:32.233', 'DIARIO', 1865, 1526, 29, 4, 16, 12, 153, 3150, NULL, 'cmsndjph70002497dqw8826yk', '2026-08-10 15:16:32.321', '2026-08-10 15:16:32.321');
INSERT INTO public."SalesEntry" (id, "empresaId", date, "periodType", "faturamentoDelivery", "faturamentoSalao", "pedidosDelivery", "pedidosBalcao", "pedidosSalao", "mesasAtendidas", "taxaServicoValor", "metaDiaria", observacoes, "createdById", "createdAt", "updatedAt") VALUES ('cmsndjpoo002c497dfsxmtep4', 'cmsndjpeg0001497dhtlyr5f9', '2026-07-19 15:16:32.233', 'DIARIO', 1959, 1603, 30, 6, 17, 12, 160, 3150, NULL, 'cmsndjph70002497dqw8826yk', '2026-08-10 15:16:32.328', '2026-08-10 15:16:32.328');
INSERT INTO public."SalesEntry" (id, "empresaId", date, "periodType", "faturamentoDelivery", "faturamentoSalao", "pedidosDelivery", "pedidosBalcao", "pedidosSalao", "mesasAtendidas", "taxaServicoValor", "metaDiaria", observacoes, "createdById", "createdAt", "updatedAt") VALUES ('cmsndjpoq002d497dkng3mqqj', 'cmsndjpeg0001497dhtlyr5f9', '2026-07-20 15:16:32.233', 'DIARIO', 1427, 1168, 22, 4, 12, 9, 117, 3150, NULL, 'cmsndjph70002497dqw8826yk', '2026-08-10 15:16:32.33', '2026-08-10 15:16:32.33');
INSERT INTO public."SalesEntry" (id, "empresaId", date, "periodType", "faturamentoDelivery", "faturamentoSalao", "pedidosDelivery", "pedidosBalcao", "pedidosSalao", "mesasAtendidas", "taxaServicoValor", "metaDiaria", observacoes, "createdById", "createdAt", "updatedAt") VALUES ('cmsndjpor002e497d6otgtm2x', 'cmsndjpeg0001497dhtlyr5f9', '2026-07-21 15:16:32.233', 'DIARIO', 1576, 1289, 24, 8, 14, 10, 129, 3150, NULL, 'cmsndjph70002497dqw8826yk', '2026-08-10 15:16:32.331', '2026-08-10 15:16:32.331');
INSERT INTO public."SalesEntry" (id, "empresaId", date, "periodType", "faturamentoDelivery", "faturamentoSalao", "pedidosDelivery", "pedidosBalcao", "pedidosSalao", "mesasAtendidas", "taxaServicoValor", "metaDiaria", observacoes, "createdById", "createdAt", "updatedAt") VALUES ('cmsndjpot002f497dkyljmrt0', 'cmsndjpeg0001497dhtlyr5f9', '2026-07-22 15:16:32.233', 'DIARIO', 1725, 1411, 27, 6, 15, 11, 141, 3150, NULL, 'cmsndjph70002497dqw8826yk', '2026-08-10 15:16:32.333', '2026-08-10 15:16:32.333');
INSERT INTO public."SalesEntry" (id, "empresaId", date, "periodType", "faturamentoDelivery", "faturamentoSalao", "pedidosDelivery", "pedidosBalcao", "pedidosSalao", "mesasAtendidas", "taxaServicoValor", "metaDiaria", observacoes, "createdById", "createdAt", "updatedAt") VALUES ('cmsndjpov002g497dfojc6g3u', 'cmsndjpeg0001497dhtlyr5f9', '2026-07-23 15:16:32.233', 'DIARIO', 1563, 1279, 24, 1, 13, 10, 128, 3150, NULL, 'cmsndjph70002497dqw8826yk', '2026-08-10 15:16:32.335', '2026-08-10 15:16:32.335');
INSERT INTO public."SalesEntry" (id, "empresaId", date, "periodType", "faturamentoDelivery", "faturamentoSalao", "pedidosDelivery", "pedidosBalcao", "pedidosSalao", "mesasAtendidas", "taxaServicoValor", "metaDiaria", observacoes, "createdById", "createdAt", "updatedAt") VALUES ('cmsndjpow002h497d8cl0x41k', 'cmsndjpeg0001497dhtlyr5f9', '2026-07-24 15:16:32.233', 'DIARIO', 1779, 1455, 27, 4, 15, 11, 146, 3150, NULL, 'cmsndjph70002497dqw8826yk', '2026-08-10 15:16:32.336', '2026-08-10 15:16:32.336');
INSERT INTO public."SalesEntry" (id, "empresaId", date, "periodType", "faturamentoDelivery", "faturamentoSalao", "pedidosDelivery", "pedidosBalcao", "pedidosSalao", "mesasAtendidas", "taxaServicoValor", "metaDiaria", observacoes, "createdById", "createdAt", "updatedAt") VALUES ('cmsndjpoy002i497d7bi5lbzl', 'cmsndjpeg0001497dhtlyr5f9', '2026-07-25 15:16:32.233', 'DIARIO', 1541, 1261, 24, 5, 13, 10, 126, 3150, NULL, 'cmsndjph70002497dqw8826yk', '2026-08-10 15:16:32.338', '2026-08-10 15:16:32.338');
INSERT INTO public."SalesEntry" (id, "empresaId", date, "periodType", "faturamentoDelivery", "faturamentoSalao", "pedidosDelivery", "pedidosBalcao", "pedidosSalao", "mesasAtendidas", "taxaServicoValor", "metaDiaria", observacoes, "createdById", "createdAt", "updatedAt") VALUES ('cmsndjpoz002j497dd3qyimbi', 'cmsndjpeg0001497dhtlyr5f9', '2026-07-26 15:16:32.233', 'DIARIO', 1838, 1504, 28, 5, 16, 12, 150, 3150, NULL, 'cmsndjph70002497dqw8826yk', '2026-08-10 15:16:32.339', '2026-08-10 15:16:32.339');
INSERT INTO public."SalesEntry" (id, "empresaId", date, "periodType", "faturamentoDelivery", "faturamentoSalao", "pedidosDelivery", "pedidosBalcao", "pedidosSalao", "mesasAtendidas", "taxaServicoValor", "metaDiaria", observacoes, "createdById", "createdAt", "updatedAt") VALUES ('cmsndjpp1002k497d75rldni5', 'cmsndjpeg0001497dhtlyr5f9', '2026-07-27 15:16:32.233', 'DIARIO', 1344, 1100, 21, 2, 12, 8, 110, 3150, NULL, 'cmsndjph70002497dqw8826yk', '2026-08-10 15:16:32.341', '2026-08-10 15:16:32.341');
INSERT INTO public."SalesEntry" (id, "empresaId", date, "periodType", "faturamentoDelivery", "faturamentoSalao", "pedidosDelivery", "pedidosBalcao", "pedidosSalao", "mesasAtendidas", "taxaServicoValor", "metaDiaria", observacoes, "createdById", "createdAt", "updatedAt") VALUES ('cmsndjpp3002l497diwdg88p3', 'cmsndjpeg0001497dhtlyr5f9', '2026-07-28 15:16:32.233', 'DIARIO', 1994, 1632, 31, 2, 17, 13, 163, 3150, NULL, 'cmsndjph70002497dqw8826yk', '2026-08-10 15:16:32.343', '2026-08-10 15:16:32.343');
INSERT INTO public."SalesEntry" (id, "empresaId", date, "periodType", "faturamentoDelivery", "faturamentoSalao", "pedidosDelivery", "pedidosBalcao", "pedidosSalao", "mesasAtendidas", "taxaServicoValor", "metaDiaria", observacoes, "createdById", "createdAt", "updatedAt") VALUES ('cmsndjpp4002m497d068dsck2', 'cmsndjpeg0001497dhtlyr5f9', '2026-07-29 15:16:32.233', 'DIARIO', 1342, 1098, 21, 2, 12, 8, 110, 3150, NULL, 'cmsndjph70002497dqw8826yk', '2026-08-10 15:16:32.344', '2026-08-10 15:16:32.344');
INSERT INTO public."SalesEntry" (id, "empresaId", date, "periodType", "faturamentoDelivery", "faturamentoSalao", "pedidosDelivery", "pedidosBalcao", "pedidosSalao", "mesasAtendidas", "taxaServicoValor", "metaDiaria", observacoes, "createdById", "createdAt", "updatedAt") VALUES ('cmsndjpp6002n497dtrk5vu22', 'cmsndjpeg0001497dhtlyr5f9', '2026-07-30 15:16:32.233', 'DIARIO', 1563, 1279, 24, 1, 13, 10, 128, 3150, NULL, 'cmsndjph70002497dqw8826yk', '2026-08-10 15:16:32.346', '2026-08-10 15:16:32.346');
INSERT INTO public."SalesEntry" (id, "empresaId", date, "periodType", "faturamentoDelivery", "faturamentoSalao", "pedidosDelivery", "pedidosBalcao", "pedidosSalao", "mesasAtendidas", "taxaServicoValor", "metaDiaria", observacoes, "createdById", "createdAt", "updatedAt") VALUES ('cmsndjpp7002o497d59j23702', 'cmsndjpeg0001497dhtlyr5f9', '2026-07-31 15:16:32.233', 'DIARIO', 1661, 1359, 26, 6, 14, 10, 136, 3150, NULL, 'cmsndjph70002497dqw8826yk', '2026-08-10 15:16:32.347', '2026-08-10 15:16:32.347');
INSERT INTO public."SalesEntry" (id, "empresaId", date, "periodType", "faturamentoDelivery", "faturamentoSalao", "pedidosDelivery", "pedidosBalcao", "pedidosSalao", "mesasAtendidas", "taxaServicoValor", "metaDiaria", observacoes, "createdById", "createdAt", "updatedAt") VALUES ('cmsndjpp8002p497d2jtgfewy', 'cmsndjpeg0001497dhtlyr5f9', '2026-08-01 15:16:32.233', 'DIARIO', 1385, 1133, 21, 3, 12, 9, 113, 3150, NULL, 'cmsndjph70002497dqw8826yk', '2026-08-10 15:16:32.348', '2026-08-10 15:16:32.348');
INSERT INTO public."SalesEntry" (id, "empresaId", date, "periodType", "faturamentoDelivery", "faturamentoSalao", "pedidosDelivery", "pedidosBalcao", "pedidosSalao", "mesasAtendidas", "taxaServicoValor", "metaDiaria", observacoes, "createdById", "createdAt", "updatedAt") VALUES ('cmsndjppa002q497dehdzs8x8', 'cmsndjpeg0001497dhtlyr5f9', '2026-08-02 15:16:32.233', 'DIARIO', 1506, 1232, 23, 1, 13, 9, 123, 3150, NULL, 'cmsndjph70002497dqw8826yk', '2026-08-10 15:16:32.35', '2026-08-10 15:16:32.35');
INSERT INTO public."SalesEntry" (id, "empresaId", date, "periodType", "faturamentoDelivery", "faturamentoSalao", "pedidosDelivery", "pedidosBalcao", "pedidosSalao", "mesasAtendidas", "taxaServicoValor", "metaDiaria", observacoes, "createdById", "createdAt", "updatedAt") VALUES ('cmsndjppc002r497dvpvnch1x', 'cmsndjpeg0001497dhtlyr5f9', '2026-08-03 15:16:32.233', 'DIARIO', 1474, 1206, 23, 1, 13, 9, 121, 3150, NULL, 'cmsndjph70002497dqw8826yk', '2026-08-10 15:16:32.352', '2026-08-10 15:16:32.352');
INSERT INTO public."SalesEntry" (id, "empresaId", date, "periodType", "faturamentoDelivery", "faturamentoSalao", "pedidosDelivery", "pedidosBalcao", "pedidosSalao", "mesasAtendidas", "taxaServicoValor", "metaDiaria", observacoes, "createdById", "createdAt", "updatedAt") VALUES ('cmsndjppe002s497dhyv5kxtc', 'cmsndjpeg0001497dhtlyr5f9', '2026-08-04 15:16:32.233', 'DIARIO', 1726, 1412, 27, 2, 15, 11, 141, 3150, NULL, 'cmsndjph70002497dqw8826yk', '2026-08-10 15:16:32.354', '2026-08-10 15:16:32.354');
INSERT INTO public."SalesEntry" (id, "empresaId", date, "periodType", "faturamentoDelivery", "faturamentoSalao", "pedidosDelivery", "pedidosBalcao", "pedidosSalao", "mesasAtendidas", "taxaServicoValor", "metaDiaria", observacoes, "createdById", "createdAt", "updatedAt") VALUES ('cmsndjppf002t497dh672u4ji', 'cmsndjpeg0001497dhtlyr5f9', '2026-08-05 15:16:32.233', 'DIARIO', 1492, 1220, 23, 7, 13, 9, 122, 3150, NULL, 'cmsndjph70002497dqw8826yk', '2026-08-10 15:16:32.355', '2026-08-10 15:16:32.355');
INSERT INTO public."SalesEntry" (id, "empresaId", date, "periodType", "faturamentoDelivery", "faturamentoSalao", "pedidosDelivery", "pedidosBalcao", "pedidosSalao", "mesasAtendidas", "taxaServicoValor", "metaDiaria", observacoes, "createdById", "createdAt", "updatedAt") VALUES ('cmsndjpph002u497d8xiddmpj', 'cmsndjpeg0001497dhtlyr5f9', '2026-08-06 15:16:32.233', 'DIARIO', 1509, 1234, 23, 4, 13, 9, 123, 3150, NULL, 'cmsndjph70002497dqw8826yk', '2026-08-10 15:16:32.357', '2026-08-10 15:16:32.357');
INSERT INTO public."SalesEntry" (id, "empresaId", date, "periodType", "faturamentoDelivery", "faturamentoSalao", "pedidosDelivery", "pedidosBalcao", "pedidosSalao", "mesasAtendidas", "taxaServicoValor", "metaDiaria", observacoes, "createdById", "createdAt", "updatedAt") VALUES ('cmsndjppj002v497d8ghxfldo', 'cmsndjpeg0001497dhtlyr5f9', '2026-08-07 15:16:32.233', 'DIARIO', 1571, 1285, 24, 7, 14, 10, 129, 3150, NULL, 'cmsndjph70002497dqw8826yk', '2026-08-10 15:16:32.359', '2026-08-10 15:16:32.359');
INSERT INTO public."SalesEntry" (id, "empresaId", date, "periodType", "faturamentoDelivery", "faturamentoSalao", "pedidosDelivery", "pedidosBalcao", "pedidosSalao", "mesasAtendidas", "taxaServicoValor", "metaDiaria", observacoes, "createdById", "createdAt", "updatedAt") VALUES ('cmsndjppl002w497d2br6nwim', 'cmsndjpeg0001497dhtlyr5f9', '2026-08-08 15:16:32.233', 'DIARIO', 1582, 1295, 24, 6, 14, 10, 130, 3150, NULL, 'cmsndjph70002497dqw8826yk', '2026-08-10 15:16:32.361', '2026-08-10 15:16:32.361');
INSERT INTO public."SalesEntry" (id, "empresaId", date, "periodType", "faturamentoDelivery", "faturamentoSalao", "pedidosDelivery", "pedidosBalcao", "pedidosSalao", "mesasAtendidas", "taxaServicoValor", "metaDiaria", observacoes, "createdById", "createdAt", "updatedAt") VALUES ('cmsndjppm002x497dttjo9u0k', 'cmsndjpeg0001497dhtlyr5f9', '2026-08-09 15:16:32.233', 'DIARIO', 2062, 1687, 32, 7, 18, 13, 169, 3150, NULL, 'cmsndjph70002497dqw8826yk', '2026-08-10 15:16:32.362', '2026-08-10 15:16:32.362');
INSERT INTO public."SalesEntry" (id, "empresaId", date, "periodType", "faturamentoDelivery", "faturamentoSalao", "pedidosDelivery", "pedidosBalcao", "pedidosSalao", "mesasAtendidas", "taxaServicoValor", "metaDiaria", observacoes, "createdById", "createdAt", "updatedAt") VALUES ('cmsndjppo002y497d1p1asqw9', 'cmsndjpeg0001497dhtlyr5f9', '2026-08-10 15:16:32.233', 'DIARIO', 1386, 1134, 21, 0, 12, 9, 113, 3150, NULL, 'cmsndjph70002497dqw8826yk', '2026-08-10 15:16:32.364', '2026-08-10 15:16:32.364');


--
-- Data for Name: Subcategory; Type: TABLE DATA; Schema: public; Owner: portal
--

INSERT INTO public."Subcategory" (id, "categoryId", key, name, icon, color, "order", active, "isSystem", "createdAt", "updatedAt") VALUES ('cmsndjpke000b497dqrikv4kb', 'cmsndjpkb000a497di5x93f8y', 'gerencia', 'Metas da Gerência', 'Briefcase', '#2952E3', 0, true, true, '2026-08-10 15:16:32.174', '2026-08-10 15:42:48.999');
INSERT INTO public."Subcategory" (id, "categoryId", key, name, icon, color, "order", active, "isSystem", "createdAt", "updatedAt") VALUES ('cmsndjpkg000c497dt88g7zyw', 'cmsndjpkb000a497di5x93f8y', 'salao', 'Metas do Salão', 'Utensils', '#2952E3', 1, true, true, '2026-08-10 15:16:32.176', '2026-08-10 15:42:49.001');
INSERT INTO public."Subcategory" (id, "categoryId", key, name, icon, color, "order", active, "isSystem", "createdAt", "updatedAt") VALUES ('cmsndjpkh000d497d5r7oiiq8', 'cmsndjpkb000a497di5x93f8y', 'cozinha', 'Metas da Cozinha', 'ChefHat', '#2952E3', 2, true, true, '2026-08-10 15:16:32.177', '2026-08-10 15:42:49.003');
INSERT INTO public."Subcategory" (id, "categoryId", key, name, icon, color, "order", active, "isSystem", "createdAt", "updatedAt") VALUES ('cmsndjpkj000e497d2x7a4mbe', 'cmsndjpkb000a497di5x93f8y', 'delivery', 'Metas do Delivery', 'Bike', '#2952E3', 3, true, true, '2026-08-10 15:16:32.179', '2026-08-10 15:42:49.005');
INSERT INTO public."Subcategory" (id, "categoryId", key, name, icon, color, "order", active, "isSystem", "createdAt", "updatedAt") VALUES ('cmsndjpkm000g497drlwk9cn4', 'cmsndjpkk000f497dwzxxyhhn', 'colaboradores', 'Colaboradores', 'IdCard', '#2952E3', 0, true, true, '2026-08-10 15:16:32.182', '2026-08-10 15:42:49.008');
INSERT INTO public."Subcategory" (id, "categoryId", key, name, icon, color, "order", active, "isSystem", "createdAt", "updatedAt") VALUES ('cmsndjpkn000h497d9hnn1eft', 'cmsndjpkk000f497dwzxxyhhn', 'ocorrencias', 'Ocorrências', 'AlertTriangle', '#2952E3', 1, true, true, '2026-08-10 15:16:32.183', '2026-08-10 15:42:49.01');
INSERT INTO public."Subcategory" (id, "categoryId", key, name, icon, color, "order", active, "isSystem", "createdAt", "updatedAt") VALUES ('cmsndjpkq000j497di0uj7tdk', 'cmsndjpkp000i497docfcnodw', 'senhas', 'Senhas', 'KeyRound', '#2952E3', 0, true, true, '2026-08-10 15:16:32.186', '2026-08-10 15:42:49.014');
INSERT INTO public."Subcategory" (id, "categoryId", key, name, icon, color, "order", active, "isSystem", "createdAt", "updatedAt") VALUES ('cmsndjpks000k497ds6bpwhtt', 'cmsndjpkp000i497docfcnodw', 'cursos', 'Cursos', 'GraduationCap', '#2952E3', 1, true, true, '2026-08-10 15:16:32.188', '2026-08-10 15:42:49.015');
INSERT INTO public."Subcategory" (id, "categoryId", key, name, icon, color, "order", active, "isSystem", "createdAt", "updatedAt") VALUES ('cmsndjpkt000l497dgdz1y8au', 'cmsndjpkp000i497docfcnodw', 'cartilhas', 'Cartilhas', 'BookOpen', '#2952E3', 2, true, true, '2026-08-10 15:16:32.189', '2026-08-10 15:42:49.017');
INSERT INTO public."Subcategory" (id, "categoryId", key, name, icon, color, "order", active, "isSystem", "createdAt", "updatedAt") VALUES ('cmsndjpkv000m497d1dw7kxh1', 'cmsndjpkp000i497docfcnodw', 'logo', 'Logo', 'Image', '#2952E3', 3, true, true, '2026-08-10 15:16:32.191', '2026-08-10 15:42:49.018');
INSERT INTO public."Subcategory" (id, "categoryId", key, name, icon, color, "order", active, "isSystem", "createdAt", "updatedAt") VALUES ('cmsndjpkx000n497d4wfoxdao', 'cmsndjpkp000i497docfcnodw', 'arquivos', 'Arquivos', 'FolderOpen', '#2952E3', 4, true, true, '2026-08-10 15:16:32.193', '2026-08-10 15:42:49.02');
INSERT INTO public."Subcategory" (id, "categoryId", key, name, icon, color, "order", active, "isSystem", "createdAt", "updatedAt") VALUES ('cmsndjpkz000p497drvy3lov0', 'cmsndjpky000o497dd42l4w2m', 'pizzas-salgadas', 'Pizzas Salgadas', 'Pizza', '#2952E3', 0, true, true, '2026-08-10 15:16:32.195', '2026-08-10 15:42:49.023');
INSERT INTO public."Subcategory" (id, "categoryId", key, name, icon, color, "order", active, "isSystem", "createdAt", "updatedAt") VALUES ('cmsndjpl0000q497dkurx3orm', 'cmsndjpky000o497dd42l4w2m', 'pizzas-doces', 'Pizzas Doces', 'Pizza', '#2952E3', 1, true, true, '2026-08-10 15:16:32.196', '2026-08-10 15:42:49.024');
INSERT INTO public."Subcategory" (id, "categoryId", key, name, icon, color, "order", active, "isSystem", "createdAt", "updatedAt") VALUES ('cmsndjpl1000r497de31v4ym8', 'cmsndjpky000o497dd42l4w2m', 'combos', 'Combos', 'Package', '#2952E3', 2, true, true, '2026-08-10 15:16:32.197', '2026-08-10 15:42:49.026');
INSERT INTO public."Subcategory" (id, "categoryId", key, name, icon, color, "order", active, "isSystem", "createdAt", "updatedAt") VALUES ('cmsndjpl3000s497d6wul1i8o', 'cmsndjpky000o497dd42l4w2m', 'esfihas-salgadas', 'Esfihas Salgadas', 'Sandwich', '#2952E3', 3, true, true, '2026-08-10 15:16:32.199', '2026-08-10 15:42:49.028');
INSERT INTO public."Subcategory" (id, "categoryId", key, name, icon, color, "order", active, "isSystem", "createdAt", "updatedAt") VALUES ('cmsndjpl4000t497dvm0np23y', 'cmsndjpky000o497dd42l4w2m', 'esfihas-doces', 'Esfihas Doces', 'Sandwich', '#2952E3', 4, true, true, '2026-08-10 15:16:32.2', '2026-08-10 15:42:49.029');
INSERT INTO public."Subcategory" (id, "categoryId", key, name, icon, color, "order", active, "isSystem", "createdAt", "updatedAt") VALUES ('cmsndjpl6000u497drfy1bp2h', 'cmsndjpky000o497dd42l4w2m', 'acompanhamentos', 'Acompanhamentos', 'Soup', '#2952E3', 5, true, true, '2026-08-10 15:16:32.202', '2026-08-10 15:42:49.03');
INSERT INTO public."Subcategory" (id, "categoryId", key, name, icon, color, "order", active, "isSystem", "createdAt", "updatedAt") VALUES ('cmsndjpl8000v497do2lff2h0', 'cmsndjpky000o497dd42l4w2m', 'burgers', 'Burgers', 'Beef', '#2952E3', 6, true, true, '2026-08-10 15:16:32.204', '2026-08-10 15:42:49.032');
INSERT INTO public."Subcategory" (id, "categoryId", key, name, icon, color, "order", active, "isSystem", "createdAt", "updatedAt") VALUES ('cmsndjpl9000w497dos9y8lg9', 'cmsndjpky000o497dd42l4w2m', 'bebidas', 'Bebidas', 'CupSoda', '#2952E3', 7, true, true, '2026-08-10 15:16:32.205', '2026-08-10 15:42:49.033');
INSERT INTO public."Subcategory" (id, "categoryId", key, name, icon, color, "order", active, "isSystem", "createdAt", "updatedAt") VALUES ('cmsndjpla000x497d5gbdese4', 'cmsndjpky000o497dd42l4w2m', 'drinks', 'Drinks', 'Martini', '#2952E3', 8, true, true, '2026-08-10 15:16:32.206', '2026-08-10 15:42:49.035');
INSERT INTO public."Subcategory" (id, "categoryId", key, name, icon, color, "order", active, "isSystem", "createdAt", "updatedAt") VALUES ('cmsndjplc000y497dgbvz2qqm', 'cmsndjpky000o497dd42l4w2m', 'insumos', 'Insumos', 'Boxes', '#2952E3', 9, true, true, '2026-08-10 15:16:32.208', '2026-08-10 15:42:49.036');
INSERT INTO public."Subcategory" (id, "categoryId", key, name, icon, color, "order", active, "isSystem", "createdAt", "updatedAt") VALUES ('cmsndjpli0010497d7clhilc5', 'cmsndjplh000z497dv2mxkt8n', 'dashboard', 'Dashboard Financeiro', 'LayoutDashboard', '#2952E3', 0, true, true, '2026-08-10 15:16:32.214', '2026-08-10 15:42:49.04');
INSERT INTO public."Subcategory" (id, "categoryId", key, name, icon, color, "order", active, "isSystem", "createdAt", "updatedAt") VALUES ('cmsndjplk0011497d9pl5mc7b', 'cmsndjplh000z497dv2mxkt8n', 'contas-a-pagar', 'Contas a Pagar', 'ArrowUpCircle', '#2952E3', 1, true, true, '2026-08-10 15:16:32.216', '2026-08-10 15:42:49.041');
INSERT INTO public."Subcategory" (id, "categoryId", key, name, icon, color, "order", active, "isSystem", "createdAt", "updatedAt") VALUES ('cmsndjplm0012497dyi7t7dyl', 'cmsndjplh000z497dv2mxkt8n', 'contas-a-receber', 'Contas a Receber', 'ArrowDownCircle', '#2952E3', 2, true, true, '2026-08-10 15:16:32.218', '2026-08-10 15:42:49.042');
INSERT INTO public."Subcategory" (id, "categoryId", key, name, icon, color, "order", active, "isSystem", "createdAt", "updatedAt") VALUES ('cmsndjplo0013497d1qzwkeh3', 'cmsndjplh000z497dv2mxkt8n', 'fluxo-de-caixa', 'Fluxo de Caixa', 'Waves', '#2952E3', 3, true, true, '2026-08-10 15:16:32.22', '2026-08-10 15:42:49.044');
INSERT INTO public."Subcategory" (id, "categoryId", key, name, icon, color, "order", active, "isSystem", "createdAt", "updatedAt") VALUES ('cmsndjplq0014497d0u9954ir', 'cmsndjplh000z497dv2mxkt8n', 'caixa-da-empresa', 'Caixa da Empresa', 'Vault', '#2952E3', 4, true, true, '2026-08-10 15:16:32.222', '2026-08-10 15:42:49.045');
INSERT INTO public."Subcategory" (id, "categoryId", key, name, icon, color, "order", active, "isSystem", "createdAt", "updatedAt") VALUES ('cmsndjplr0015497dlwvobc5i', 'cmsndjplh000z497dv2mxkt8n', 'dre', 'DRE', 'FileBarChart', '#2952E3', 5, true, true, '2026-08-10 15:16:32.223', '2026-08-10 15:42:49.046');
INSERT INTO public."Subcategory" (id, "categoryId", key, name, icon, color, "order", active, "isSystem", "createdAt", "updatedAt") VALUES ('cmsndjplt0016497dzhk6qb4e', 'cmsndjplh000z497dv2mxkt8n', 'categorias-financeiras', 'Categorias Financeiras', 'Tags', '#2952E3', 6, true, true, '2026-08-10 15:16:32.225', '2026-08-10 15:42:49.048');
INSERT INTO public."Subcategory" (id, "categoryId", key, name, icon, color, "order", active, "isSystem", "createdAt", "updatedAt") VALUES ('cmsndjplu0017497ds6idfzjt', 'cmsndjplh000z497dv2mxkt8n', 'contas-bancarias', 'Contas Bancárias', 'Landmark', '#2952E3', 7, true, true, '2026-08-10 15:16:32.227', '2026-08-10 15:42:49.049');
INSERT INTO public."Subcategory" (id, "categoryId", key, name, icon, color, "order", active, "isSystem", "createdAt", "updatedAt") VALUES ('cmsndjplw0018497dl0d69ywx', 'cmsndjplh000z497dv2mxkt8n', 'relatorios', 'Relatórios', 'FileSpreadsheet', '#2952E3', 8, true, true, '2026-08-10 15:16:32.228', '2026-08-10 15:42:49.051');


--
-- Data for Name: UserEmpresaAccess; Type: TABLE DATA; Schema: public; Owner: portal
--

INSERT INTO public."UserEmpresaAccess" (id, "userId", "empresaId", "createdAt") VALUES ('cmsndjpjs0004497dyg2g9tsw', 'cmsndjph70002497dqw8826yk', 'cmsndjpe00000497dhfcr8mzd', '2026-08-10 15:16:32.152');
INSERT INTO public."UserEmpresaAccess" (id, "userId", "empresaId", "createdAt") VALUES ('cmsndjpjw0005497d5pumcpg7', 'cmsndjph70002497dqw8826yk', 'cmsndjpeg0001497dhtlyr5f9', '2026-08-10 15:16:32.156');
INSERT INTO public."UserEmpresaAccess" (id, "userId", "empresaId", "createdAt") VALUES ('cmsndjpk00006497ds96zuvw1', 'cmsndjpjl0003497dnui645jc', 'cmsndjpe00000497dhfcr8mzd', '2026-08-10 15:16:32.16');


--
-- Data for Name: UserPermission; Type: TABLE DATA; Schema: public; Owner: portal
--



--
-- Data for Name: VaultEntry; Type: TABLE DATA; Schema: public; Owner: portal
--



--
-- Data for Name: VaultAccessLog; Type: TABLE DATA; Schema: public; Owner: portal
--



--
-- Data for Name: VaultHistory; Type: TABLE DATA; Schema: public; Owner: portal
--



--
-- PostgreSQL database dump complete
--


