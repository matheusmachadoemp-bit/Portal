-- Portal Nord — setup completo (reset + tabelas + dados iniciais)
-- Cole este arquivo INTEIRO no SQL Editor do Neon e clique em Run UMA VEZ.

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
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
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
CREATE UNIQUE INDEX "Category_key_key" ON "Category"("key");

-- CreateIndex
CREATE UNIQUE INDEX "Subcategory_categoryId_key_key" ON "Subcategory"("categoryId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "MenuPreference_userId_key" ON "MenuPreference"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Product_code_key" ON "Product"("code");

-- AddForeignKey
ALTER TABLE "UserPermission" ADD CONSTRAINT "UserPermission_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subcategory" ADD CONSTRAINT "Subcategory_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MenuPreference" ADD CONSTRAINT "MenuPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesEntry" ADD CONSTRAINT "SalesEntry_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingEntry" ADD CONSTRAINT "MarketingEntry_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Goal" ADD CONSTRAINT "Goal_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoalAttachment" ADD CONSTRAINT "GoalAttachment_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "Goal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

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
ALTER TABLE "IngredientPriceHistory" ADD CONSTRAINT "IngredientPriceHistory_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "Ingredient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductIngredient" ADD CONSTRAINT "ProductIngredient_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductIngredient" ADD CONSTRAINT "ProductIngredient_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "Ingredient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Portal Nord — script de inicialização para colar no SQL Editor do Neon
-- (rode isso DEPOIS de já ter aplicado as migrações do Prisma / criado as tabelas)

-- Usuários de acesso
INSERT INTO "User" (id, name, email, "passwordHash", role, active, "createdAt", "updatedAt")
VALUES
  (gen_random_uuid()::text, 'Administrador Nord', 'admin@nordpizza.com', '$2b$10$n6j3mtJoF0lwROziBQ2.l.jz3WEH4ZEBXtWcGF4dVlTvXH1acd55.', 'ADMINISTRADOR', true, now(), now()),
  (gen_random_uuid()::text, 'Gerente Nord', 'gerente@nordpizza.com', '$2b$10$YR397qOaUONMIPPOWU0c..ZLZHFjz98xJWHLEynTSjxrRkd0ehp/u', 'GERENTE', true, now(), now());

-- Categorias do menu
INSERT INTO "Category" (id, key, name, icon, "order", "isSystem", "contentType", "createdAt", "updatedAt")
VALUES
  (gen_random_uuid()::text, 'inicio', 'Início', 'Home', 0, true, 'dashboard', now(), now()),
  (gen_random_uuid()::text, 'vendas', 'Vendas', 'ShoppingCart', 1, true, 'vendas', now(), now()),
  (gen_random_uuid()::text, 'marketing', 'Marketing', 'Megaphone', 2, true, 'marketing', now(), now()),
  (gen_random_uuid()::text, 'metas', 'Metas', 'Target', 3, true, 'metas', now(), now()),
  (gen_random_uuid()::text, 'rh', 'RH', 'Users', 4, true, 'rh', now(), now()),
  (gen_random_uuid()::text, 'administrativo', 'Administrativo', 'Building2', 5, true, 'administrativo', now(), now()),
  (gen_random_uuid()::text, 'ficha-tecnica', 'Ficha Técnica', 'ClipboardList', 6, true, 'ficha-tecnica', now(), now()),
  (gen_random_uuid()::text, 'configuracoes', 'Configurações', 'Settings', 7, true, 'configuracoes', now(), now()),
  (gen_random_uuid()::text, 'usuarios', 'Usuários', 'UserCog', 8, true, 'usuarios', now(), now());

-- Subcategorias de Metas
INSERT INTO "Subcategory" (id, "categoryId", key, name, icon, "order", "isSystem", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, c.id, s.key, s.name, s.icon, s.ord, true, now(), now()
FROM "Category" c
JOIN (VALUES
  ('gerencia', 'Metas da Gerência', 'Briefcase', 0),
  ('salao', 'Metas do Salão', 'Utensils', 1),
  ('cozinha', 'Metas da Cozinha', 'ChefHat', 2),
  ('delivery', 'Metas do Delivery', 'Bike', 3)
) AS s(key, name, icon, ord) ON true
WHERE c.key = 'metas';

-- Subcategorias de RH
INSERT INTO "Subcategory" (id, "categoryId", key, name, icon, "order", "isSystem", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, c.id, s.key, s.name, s.icon, s.ord, true, now(), now()
FROM "Category" c
JOIN (VALUES
  ('colaboradores', 'Colaboradores', 'IdCard', 0),
  ('ocorrencias', 'Ocorrências', 'AlertTriangle', 1)
) AS s(key, name, icon, ord) ON true
WHERE c.key = 'rh';

-- Subcategorias de Administrativo
INSERT INTO "Subcategory" (id, "categoryId", key, name, icon, "order", "isSystem", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, c.id, s.key, s.name, s.icon, s.ord, true, now(), now()
FROM "Category" c
JOIN (VALUES
  ('senhas', 'Senhas', 'KeyRound', 0),
  ('cursos', 'Cursos', 'GraduationCap', 1),
  ('cartilhas', 'Cartilhas', 'BookOpen', 2),
  ('logo', 'Logo', 'Image', 3),
  ('arquivos', 'Arquivos', 'FolderOpen', 4)
) AS s(key, name, icon, ord) ON true
WHERE c.key = 'administrativo';

-- Subcategorias de Ficha Técnica
INSERT INTO "Subcategory" (id, "categoryId", key, name, icon, "order", "isSystem", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, c.id, s.key, s.name, s.icon, s.ord, true, now(), now()
FROM "Category" c
JOIN (VALUES
  ('pizzas-salgadas', 'Pizzas Salgadas', 'Pizza', 0),
  ('pizzas-doces', 'Pizzas Doces', 'Pizza', 1),
  ('combos', 'Combos', 'Package', 2),
  ('esfihas-salgadas', 'Esfihas Salgadas', 'Sandwich', 3),
  ('esfihas-doces', 'Esfihas Doces', 'Sandwich', 4),
  ('acompanhamentos', 'Acompanhamentos', 'Soup', 5),
  ('burgers', 'Burgers', 'Beef', 6),
  ('bebidas', 'Bebidas', 'CupSoda', 7),
  ('drinks', 'Drinks', 'Martini', 8),
  ('insumos', 'Insumos', 'Boxes', 9)
) AS s(key, name, icon, ord) ON true
WHERE c.key = 'ficha-tecnica';

-- Subcategorias de Vendas
INSERT INTO "Subcategory" (id, "categoryId", key, name, icon, "order", "isSystem", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, c.id, s.key, s.name, s.icon, s.ord, true, now(), now()
FROM "Category" c
JOIN (VALUES
  ('lancamentos', 'Lançamentos', 'ReceiptText', 0),
  ('itens-vendidos', 'Curva ABC', 'BarChart3', 1),
  ('garcons', 'Desempenho por Garçom', 'Users', 2),
  ('por-hora', 'Vendas por Hora', 'Clock', 3),
  ('periodo', 'Vendas por Período', 'CalendarRange', 4),
  ('pagamento', 'Forma de Pagamento', 'CreditCard', 5),
  ('entrega', 'Área de Entrega', 'MapPin', 6)
) AS s(key, name, icon, ord) ON true
WHERE c.key = 'vendas';
