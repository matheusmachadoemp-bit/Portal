-- RH — catálogo de Cargos e Setores (EmployeeCargo/EmployeeSetor).
--
-- Contexto: `Employee.cargo`/`Employee.setor` eram texto livre em RH > Colaboradores — já causou
-- um bug real (um cargo de "liderança" digitado de um jeito que não batia, nem por acidente, com
-- nenhum dos 3 nomes fixos do catálogo do Fechamento do Dia, travou silenciosamente quem deveria
-- preencher o formulário; confirmado e corrigido manualmente pelo usuário, ver relatório da
-- investigação "fechamento do dia não chega pra liderança"). Esta migration cria o catálogo
-- (schema, gerado por `prisma migrate dev`) e faz o BACKFILL de dado (mesmo racional dos demais
-- backfills deste projeto — ver 20260914130000_fechamento_dia_backfill_catalogo,
-- 20260912190000_backfill_module_permission_cmv: `scripts/migrate-deploy.sh` só roda
-- `prisma migrate deploy`, nunca `npm run db:seed` — sem este backfill aqui dentro da própria
-- migration, o catálogo nasceria vazio em produção e toda validação de cargo/setor na rota de
-- colaborador rejeitaria/travaria colaboradores já existentes até alguém recadastrar tudo à mão).
--
-- Conteúdo do backfill (idempotente via ON CONFLICT DO NOTHING — nunca duplica nem sobrescreve):
-- 1) Um `EmployeeCargo`/`EmployeeSetor` para cada valor DISTINTO que já existe hoje em
--    `Employee.cargo`/`Employee.setor`, por empresa — preserva 100% do dado já cadastrado (nenhum
--    colaborador existente fica com um cargo/setor "órfão" do catálogo no momento em que a
--    validação da rota passar a exigir).
-- 2) Um `EmployeeCargo` para cada `FechamentoCargo.nome` já cadastrado, por empresa — garante que
--    os cargos do Fechamento do Dia ("Gerente"/"Chef de Salão"/"Chef de Cozinha") sempre apareçam
--    como opção no catálogo de RH, mesmo numa loja onde, hoje, nenhum `Employee` tenha esse texto
--    exato (ex.: uma loja sem nenhum colaborador ainda cadastrado como "Gerente" no RH, mesmo já
--    tendo o cargo "Gerente" configurado no Fechamento do Dia) — sem isso, cadastrar/editar esse
--    colaborador exigiria digitar um cargo novo (o auto-cadastro da rota cobre isso de qualquer
--    forma, mas antecipar aqui evita o próprio problema que originou esta tarefa: alguém
--    escolhendo/digitando um texto que não bate com o nome exato esperado pelo Fechamento do
--    Dia). Não decide nada sobre "liderança" — só garante que os 3 cargos que JÁ EXISTEM no
--    catálogo do Fechamento do Dia também existam no catálogo de RH.
--
-- NOTA (fora do escopo desta migration, ver relatório): ao gerar esta migration com `prisma
-- migrate dev`, o diff também trouxe 3 DropForeignKey/AddForeignKey (Sale/SalesEntry/
-- MarketingEntry .createdById, RESTRICT -> SET NULL) e 1 RenameIndex (MetaAdsInsight) — drift
-- PRÉ-EXISTENTE entre schema.prisma e o histórico de migrations, confirmado reproduzível mesmo
-- sem nenhuma alteração deste agente (checado revertendo temporariamente as mudanças de
-- EmployeeCargo/EmployeeSetor e gerando o diff de novo). Removido deste arquivo de propósito —
-- não faz parte desta tarefa (Employee.cargo/setor) e merece sua própria migration dedicada,
-- reportado separadamente.

-- CreateTable
CREATE TABLE "EmployeeCargo" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmployeeCargo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeSetor" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmployeeSetor_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EmployeeCargo_empresaId_idx" ON "EmployeeCargo"("empresaId");

-- CreateIndex
CREATE UNIQUE INDEX "EmployeeCargo_empresaId_nome_key" ON "EmployeeCargo"("empresaId", "nome");

-- CreateIndex
CREATE INDEX "EmployeeSetor_empresaId_idx" ON "EmployeeSetor"("empresaId");

-- CreateIndex
CREATE UNIQUE INDEX "EmployeeSetor_empresaId_nome_key" ON "EmployeeSetor"("empresaId", "nome");

-- AddForeignKey
ALTER TABLE "EmployeeCargo" ADD CONSTRAINT "EmployeeCargo_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeSetor" ADD CONSTRAINT "EmployeeSetor_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill 1a: um EmployeeCargo por valor distinto já existente em Employee.cargo, por empresa.
INSERT INTO "EmployeeCargo" ("id", "empresaId", "nome", "ativo", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, e."empresaId", TRIM(e."cargo"), true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Employee" e
WHERE TRIM(e."cargo") <> ''
GROUP BY e."empresaId", TRIM(e."cargo")
ON CONFLICT ("empresaId", "nome") DO NOTHING;

-- Backfill 1b: um EmployeeSetor por valor distinto já existente em Employee.setor, por empresa.
INSERT INTO "EmployeeSetor" ("id", "empresaId", "nome", "ativo", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, e."empresaId", TRIM(e."setor"), true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Employee" e
WHERE TRIM(e."setor") <> ''
GROUP BY e."empresaId", TRIM(e."setor")
ON CONFLICT ("empresaId", "nome") DO NOTHING;

-- Backfill 2: garante que os 3 cargos do Fechamento do Dia também existam no catálogo de RH,
-- por empresa, mesmo que nenhum Employee use esse texto exato ainda.
INSERT INTO "EmployeeCargo" ("id", "empresaId", "nome", "ativo", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, fc."empresaId", TRIM(fc."nome"), true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "FechamentoCargo" fc
WHERE TRIM(fc."nome") <> ''
GROUP BY fc."empresaId", TRIM(fc."nome")
ON CONFLICT ("empresaId", "nome") DO NOTHING;
