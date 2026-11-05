-- AlterTable
ALTER TABLE "FechamentoPergunta" ADD COLUMN     "inverterPolaridade" BOOLEAN NOT NULL DEFAULT false;

-- Backfill de dado (sem alteração de schema) — mesmo racional exato do backfill já feito na
-- migration 20260912200000_fechamento_dia_fase1 para "fechamento-dia:gerencia/salao/cozinha": o
-- deploy automático (scripts/migrate-deploy.sh) só roda `prisma migrate deploy`, nunca o seed.
-- Fase 4, Parte 1 (Chef Delivery) adiciona um 4º `FechamentoCargo.key` ("delivery") ao catálogo
-- — mas `PermissionProfile` é GLOBAL (não por empresa, `@@unique([key])`), e os 8 perfis já
-- existem em produção desde antes desta fase. Sem este INSERT, todo PermissionProfile já
-- existente ficaria sem nenhuma linha "fechamento-dia:delivery" em `ModulePermission`, e
-- `hasModulePermission`/`GET /api/fechamento-dia/cargos/[cargoId]/perguntas` (que checa
-- `canView`/`canExecute` com `subcategoryKey = cargo.key = "delivery"`) cairia no fallback para
-- a chave do módulo inteiro ("fechamento-dia") — que é MAIS PERMISSIVA do que o pretendido aqui
-- (ex.: "gerente" ganharia canExecute=true pro formulário de Chef Delivery, quando a regra deste
-- módulo é "gerente" só executa a subcategoria 'gerencia', só visualiza as demais). Mesmo
-- critério exato de `fechamentoFlagsForCargo` (prisma/seed.ts) para qualquer cargoKey !=
-- 'gerencia': administrador (tudo); supervisor/lider/funcionario (canView+canExecute);
-- gerente/gestor (canView apenas); marketing/financeiro (sem linha, igual aos outros 3 cargos).
--
-- ON CONFLICT DO NOTHING: idempotente (roda sem erro mesmo se o seed já tiver criado a linha
-- antes desta migration — ex. ambiente de desenvolvimento) e nunca sobrescreve uma
-- personalização manual já feita na tela de Permissões.
INSERT INTO "ModulePermission" ("id", "profileId", "moduleKey", "canView", "canExecute", "canCreate", "canEdit", "canDelete")
SELECT
  pp."id" || '_fechamento-dia-delivery',
  pp."id",
  'fechamento-dia:delivery',
  true,
  CASE
    WHEN pp."key" = 'administrador' THEN true
    WHEN pp."key" IN ('supervisor', 'lider', 'funcionario') THEN true
    ELSE false
  END,
  CASE WHEN pp."key" = 'administrador' THEN true ELSE false END,
  CASE WHEN pp."key" = 'administrador' THEN true ELSE false END,
  CASE WHEN pp."key" = 'administrador' THEN true ELSE false END
FROM "PermissionProfile" pp
WHERE pp."key" IN ('administrador', 'gestor', 'gerente', 'supervisor', 'lider', 'funcionario')
ON CONFLICT ("profileId", "moduleKey") DO NOTHING;
