-- Achado reportado pelo Matheus: a usuária Gabriele (perfil de permissão "Financeiro") não
-- conseguia excluir um cadastro de colaborador duplicado por engano ("Paulo Sérgio Lima Rabelo",
-- RH > Colaboradores) mesmo tendo acesso à tela (seu `Role` já passa pelo gate de cargo
-- MANAGER_ROLES usado por `src/app/portal/rh/colaboradores/page.tsx` e por
-- `src/app/api/rh/employees/[id]/route.ts`). Causa raiz confirmada ao vivo (banco descartável):
-- o perfil "financeiro" nasce (`prisma/seed.ts`, nível padrão "VISUALIZAR" de
-- `defaultLevelForProfileKey`) com `ModulePermission` do módulo "rh" tendo só `canView = true` —
-- `canDelete = false`, então `hasModulePermission(..., "rh", "canDelete")` nega e a rota DELETE
-- devolve 403 ("Seu perfil de permissão não permite excluir colaboradores."). Confirmado também,
-- no mesmo teste ao vivo, que NÃO existe nenhum bug técnico associado: excluir um `Employee` com
-- dados relacionados (Ocorrência, Ponto, login de usuário vinculado) funciona sem erro mesmo hoje
-- — todas as relações filhas de `Employee` já são `onDelete: Cascade`, e as poucas relações
-- opcionais (`User.employeeId`, `ImportedGarcomItem.employeeId`, `Sale.garcomId`,
-- `Goal.responsavelEmployeeId`, `CustomerSurveyResponse.garcomIndicadoId`) já são `SetNull` por
-- padrão do Prisma (campo opcional sem `onDelete` explícito) — a exclusão só falhava por
-- permissão, nunca por violação de chave estrangeira.
--
-- Decisão confirmada com o Matheus: Financeiro precisa gerenciar cadastro de colaborador (folha
-- de pagamento, correção de duplicidade etc.), então ganha `canDelete` no módulo "rh". Só este
-- módulo, só este perfil — `canView`/`canExecute`/`canCreate`/`canEdit` continuam exatamente como
-- já estavam (nível "VISUALIZAR": só `canView = true`), e nenhum outro perfil/módulo é tocado.
--
-- UPDATE (não INSERT): diferente da migration-exemplo
-- 20261023194500_administrativo_bugs_melhorias_restringe_nao_admin (que criava uma linha NOVA
-- para uma chave composta que ainda não existia), a linha "financeiro" + "rh" já existe desde o
-- seed original (todo perfil ganha uma linha para cada módulo do catálogo `MODULES`) — então o
-- backfill de produção é um UPDATE simples, não um INSERT. Mesmo padrão de UPDATE já usado em
-- 20260912163500_permissao_executar_checklist.
UPDATE "ModulePermission"
SET "canDelete" = true
WHERE "moduleKey" = 'rh'
  AND "profileId" IN (SELECT "id" FROM "PermissionProfile" WHERE "key" = 'financeiro');
