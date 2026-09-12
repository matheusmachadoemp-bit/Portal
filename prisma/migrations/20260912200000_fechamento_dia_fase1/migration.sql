-- CreateEnum
CREATE TYPE "FechamentoTipoResposta" AS ENUM ('SIM_NAO', 'TEXTO', 'MULTIPLA_ESCOLHA', 'NOTA_1_5', 'NUMERO', 'PRODUTO', 'COLABORADOR', 'FOTO', 'ANEXO');

-- CreateEnum
CREATE TYPE "FechamentoGravidade" AS ENUM ('INFORMATIVO', 'ATENCAO', 'IMPORTANTE', 'CRITICO');

-- CreateEnum
CREATE TYPE "FechamentoSubmissaoStatus" AS ENUM ('PENDENTE', 'ENVIADO', 'ATRASADO');

-- CreateEnum
CREATE TYPE "FechamentoEscalationType" AS ENUM ('AVISO_ANTES', 'NO_LIMITE', 'ATRASO_RESPONSAVEL', 'ALERTA_CRITICO');

-- CreateTable
CREATE TABLE "FechamentoCargo" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "icon" TEXT NOT NULL DEFAULT 'UserCog',
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "responsavelId" TEXT,
    "substitutoId" TEXT,
    "superiorEscalonamentoId" TEXT,
    "horarioLiberacao" TEXT NOT NULL,
    "horarioLimite" TEXT NOT NULL,
    "segunda" BOOLEAN NOT NULL DEFAULT true,
    "terca" BOOLEAN NOT NULL DEFAULT true,
    "quarta" BOOLEAN NOT NULL DEFAULT true,
    "quinta" BOOLEAN NOT NULL DEFAULT true,
    "sexta" BOOLEAN NOT NULL DEFAULT true,
    "sabado" BOOLEAN NOT NULL DEFAULT true,
    "domingo" BOOLEAN NOT NULL DEFAULT true,
    "avisoAntesMinutos" INTEGER NOT NULL DEFAULT 30,
    "avisoAtrasoResponsavelMinutos" INTEGER NOT NULL DEFAULT 10,
    "alertaCriticoMinutos" INTEGER NOT NULL DEFAULT 30,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FechamentoCargo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FechamentoPergunta" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "orientacao" TEXT,
    "tipo" "FechamentoTipoResposta" NOT NULL DEFAULT 'TEXTO',
    "obrigatoria" BOOLEAN NOT NULL DEFAULT true,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "ativa" BOOLEAN NOT NULL DEFAULT true,
    "abreOcorrencia" BOOLEAN NOT NULL DEFAULT false,
    "perguntaPaiId" TEXT,
    "valorPaiQueExibe" TEXT,
    "categoriaSugeridaId" TEXT,
    "gravidadeSugerida" "FechamentoGravidade",
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FechamentoPergunta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FechamentoPerguntaCargo" (
    "perguntaId" TEXT NOT NULL,
    "cargoId" TEXT NOT NULL,

    CONSTRAINT "FechamentoPerguntaCargo_pkey" PRIMARY KEY ("perguntaId","cargoId")
);

-- CreateTable
CREATE TABLE "FechamentoPerguntaOpcao" (
    "id" TEXT NOT NULL,
    "perguntaId" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "FechamentoPerguntaOpcao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FechamentoCategoria" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "icon" TEXT NOT NULL DEFAULT 'AlertTriangle',
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "ativa" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "FechamentoCategoria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FechamentoSubmissao" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "cargoId" TEXT NOT NULL,
    "data" TIMESTAMP(3) NOT NULL,
    "releaseAt" TIMESTAMP(3) NOT NULL,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "status" "FechamentoSubmissaoStatus" NOT NULL DEFAULT 'PENDENTE',
    "notaGeral" INTEGER,
    "enviadoPorId" TEXT,
    "enviadoEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FechamentoSubmissao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FechamentoEscalationLog" (
    "id" TEXT NOT NULL,
    "submissaoId" TEXT NOT NULL,
    "tipo" "FechamentoEscalationType" NOT NULL,
    "destinatarioId" TEXT NOT NULL,
    "notificationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FechamentoEscalationLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FechamentoResposta" (
    "id" TEXT NOT NULL,
    "submissaoId" TEXT NOT NULL,
    "perguntaId" TEXT NOT NULL,
    "valorBooleano" BOOLEAN,
    "valorTexto" TEXT,
    "valorNumero" DOUBLE PRECISION,
    "valorNota" INTEGER,
    "opcaoId" TEXT,
    "produtoId" TEXT,
    "colaboradorId" TEXT,
    "fotoUrl" TEXT,
    "anexoUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FechamentoResposta_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FechamentoCargo_empresaId_idx" ON "FechamentoCargo"("empresaId");

-- CreateIndex
CREATE UNIQUE INDEX "FechamentoCargo_empresaId_key_key" ON "FechamentoCargo"("empresaId", "key");

-- CreateIndex
CREATE INDEX "FechamentoPergunta_empresaId_idx" ON "FechamentoPergunta"("empresaId");

-- CreateIndex
CREATE INDEX "FechamentoPergunta_perguntaPaiId_idx" ON "FechamentoPergunta"("perguntaPaiId");

-- CreateIndex
CREATE UNIQUE INDEX "FechamentoPerguntaOpcao_perguntaId_texto_key" ON "FechamentoPerguntaOpcao"("perguntaId", "texto");

-- CreateIndex
CREATE UNIQUE INDEX "FechamentoCategoria_empresaId_nome_key" ON "FechamentoCategoria"("empresaId", "nome");

-- CreateIndex
CREATE INDEX "FechamentoSubmissao_empresaId_data_idx" ON "FechamentoSubmissao"("empresaId", "data");

-- CreateIndex
CREATE UNIQUE INDEX "FechamentoSubmissao_cargoId_data_key" ON "FechamentoSubmissao"("cargoId", "data");

-- CreateIndex
CREATE UNIQUE INDEX "FechamentoEscalationLog_submissaoId_tipo_destinatarioId_key" ON "FechamentoEscalationLog"("submissaoId", "tipo", "destinatarioId");

-- CreateIndex
CREATE UNIQUE INDEX "FechamentoResposta_submissaoId_perguntaId_key" ON "FechamentoResposta"("submissaoId", "perguntaId");

-- AddForeignKey
ALTER TABLE "FechamentoCargo" ADD CONSTRAINT "FechamentoCargo_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FechamentoCargo" ADD CONSTRAINT "FechamentoCargo_responsavelId_fkey" FOREIGN KEY ("responsavelId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FechamentoCargo" ADD CONSTRAINT "FechamentoCargo_substitutoId_fkey" FOREIGN KEY ("substitutoId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FechamentoCargo" ADD CONSTRAINT "FechamentoCargo_superiorEscalonamentoId_fkey" FOREIGN KEY ("superiorEscalonamentoId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FechamentoCargo" ADD CONSTRAINT "FechamentoCargo_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FechamentoPergunta" ADD CONSTRAINT "FechamentoPergunta_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FechamentoPergunta" ADD CONSTRAINT "FechamentoPergunta_perguntaPaiId_fkey" FOREIGN KEY ("perguntaPaiId") REFERENCES "FechamentoPergunta"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FechamentoPergunta" ADD CONSTRAINT "FechamentoPergunta_categoriaSugeridaId_fkey" FOREIGN KEY ("categoriaSugeridaId") REFERENCES "FechamentoCategoria"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FechamentoPergunta" ADD CONSTRAINT "FechamentoPergunta_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FechamentoPerguntaCargo" ADD CONSTRAINT "FechamentoPerguntaCargo_perguntaId_fkey" FOREIGN KEY ("perguntaId") REFERENCES "FechamentoPergunta"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FechamentoPerguntaCargo" ADD CONSTRAINT "FechamentoPerguntaCargo_cargoId_fkey" FOREIGN KEY ("cargoId") REFERENCES "FechamentoCargo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FechamentoPerguntaOpcao" ADD CONSTRAINT "FechamentoPerguntaOpcao_perguntaId_fkey" FOREIGN KEY ("perguntaId") REFERENCES "FechamentoPergunta"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FechamentoCategoria" ADD CONSTRAINT "FechamentoCategoria_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FechamentoSubmissao" ADD CONSTRAINT "FechamentoSubmissao_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FechamentoSubmissao" ADD CONSTRAINT "FechamentoSubmissao_cargoId_fkey" FOREIGN KEY ("cargoId") REFERENCES "FechamentoCargo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FechamentoSubmissao" ADD CONSTRAINT "FechamentoSubmissao_enviadoPorId_fkey" FOREIGN KEY ("enviadoPorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FechamentoEscalationLog" ADD CONSTRAINT "FechamentoEscalationLog_submissaoId_fkey" FOREIGN KEY ("submissaoId") REFERENCES "FechamentoSubmissao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FechamentoEscalationLog" ADD CONSTRAINT "FechamentoEscalationLog_destinatarioId_fkey" FOREIGN KEY ("destinatarioId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FechamentoResposta" ADD CONSTRAINT "FechamentoResposta_submissaoId_fkey" FOREIGN KEY ("submissaoId") REFERENCES "FechamentoSubmissao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FechamentoResposta" ADD CONSTRAINT "FechamentoResposta_perguntaId_fkey" FOREIGN KEY ("perguntaId") REFERENCES "FechamentoPergunta"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FechamentoResposta" ADD CONSTRAINT "FechamentoResposta_opcaoId_fkey" FOREIGN KEY ("opcaoId") REFERENCES "FechamentoPerguntaOpcao"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FechamentoResposta" ADD CONSTRAINT "FechamentoResposta_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FechamentoResposta" ADD CONSTRAINT "FechamentoResposta_colaboradorId_fkey" FOREIGN KEY ("colaboradorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill de dado (sem alteração de schema) — mesmo racional dos backfills de "cmv"/
-- "producao"/"manutencao": o deploy automático (scripts/migrate-deploy.sh) só roda
-- `prisma migrate deploy`, nunca o seed — sem este backfill, todo PermissionProfile já
-- existente em produção nasceria SEM NENHUMA linha de ModulePermission para
-- "fechamento-dia" (nem para a chave do módulo inteiro, nem para as 3 subcategorias de
-- cargo), e `hasModulePermission` nega por padrão quando não encontra linha (ninguém
-- veria o módulo, mesmo o Administrador só continua liberado porque o cargo ADMINISTRADOR
-- ignora ModulePermission por completo — todo outro perfil ficaria bloqueado).
--
-- Primeiro INSERT: chave do módulo inteiro ("fechamento-dia") — canView para todos;
-- canExecute/canCreate/canEdit para administrador/gestor/gerente/supervisor; canDelete só
-- administrador. Mesmo critério exato dos backfills de "cmv"/"producao"/"manutencao".
--
-- Segundo INSERT: as 3 subcategorias por cargo ("fechamento-dia:gerencia/salao/cozinha"),
-- com o refinamento específico deste módulo (decisão do usuário, item 4): perfis
-- operacionais (funcionário/supervisor/líder) executam qualquer um dos 3 cargos — quem de
-- fato preenche qual cargo em cada loja é `FechamentoCargo.responsavelId`, não o perfil de
-- permissão; "gerente" só executa a subcategoria "gerencia" (preenche o próprio formulário)
-- e só visualiza "salao"/"cozinha"; "gestor" só visualiza os 3 (supervisiona, não preenche
-- pessoalmente); "administrador" tem acesso total aos 3; "marketing"/"financeiro" não
-- ganham linha nenhuma de subcategoria (ficam só com o canView herdado da chave do módulo
-- inteiro, primeiro INSERT).
--
-- ON CONFLICT DO NOTHING nos dois: idempotente e nunca sobrescreve uma customização manual
-- já feita na tela de Permissões.
INSERT INTO "ModulePermission" ("id", "profileId", "moduleKey", "canView", "canExecute", "canCreate", "canEdit", "canDelete")
SELECT
  pp."id" || '_fechamento-dia',
  pp."id",
  'fechamento-dia',
  true,
  CASE WHEN pp."key" IN ('administrador', 'gestor', 'gerente', 'supervisor') THEN true ELSE false END,
  CASE WHEN pp."key" IN ('administrador', 'gestor', 'gerente', 'supervisor') THEN true ELSE false END,
  CASE WHEN pp."key" IN ('administrador', 'gestor', 'gerente', 'supervisor') THEN true ELSE false END,
  CASE WHEN pp."key" = 'administrador' THEN true ELSE false END
FROM "PermissionProfile" pp
ON CONFLICT ("profileId", "moduleKey") DO NOTHING;

INSERT INTO "ModulePermission" ("id", "profileId", "moduleKey", "canView", "canExecute", "canCreate", "canEdit", "canDelete")
SELECT
  pp."id" || '_fechamento-dia-' || cargo."key",
  pp."id",
  'fechamento-dia:' || cargo."key",
  true,
  CASE
    WHEN pp."key" = 'administrador' THEN true
    WHEN pp."key" IN ('supervisor', 'lider', 'funcionario') THEN true
    WHEN pp."key" = 'gerente' AND cargo."key" = 'gerencia' THEN true
    ELSE false
  END,
  CASE WHEN pp."key" = 'administrador' THEN true ELSE false END,
  CASE WHEN pp."key" = 'administrador' THEN true ELSE false END,
  CASE WHEN pp."key" = 'administrador' THEN true ELSE false END
FROM "PermissionProfile" pp
CROSS JOIN (VALUES ('gerencia'), ('salao'), ('cozinha')) AS cargo("key")
WHERE pp."key" IN ('administrador', 'gestor', 'gerente', 'supervisor', 'lider', 'funcionario')
ON CONFLICT ("profileId", "moduleKey") DO NOTHING;
