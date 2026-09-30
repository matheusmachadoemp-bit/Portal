-- Backfill de dado (sem alteração de schema) — mesmo racional exato do backfill de
-- "fechamento-dia"/"fechamento-dia:gerencia|salao|cozinha"
-- (prisma/migrations/20260912200000_fechamento_dia_fase1): o deploy automático
-- (scripts/migrate-deploy.sh) só roda `prisma migrate deploy`, nunca `prisma/seed.ts` — uma
-- mudança só no seed (a lógica em si já está em prisma/seed.ts, bloco "Satisfação do Cliente >
-- Roleta de Prêmios > resgate") nunca chegaria a nenhum `PermissionProfile` já existente em
-- produção. Este backfill é o que faz a mudança valer de verdade pros perfis que já existem
-- hoje; qualquer `PermissionProfile` criado DEPOIS desta migration (não deveria acontecer, os
-- 8 perfis do catálogo `PERMISSION_PROFILES` já existem desde o seed inicial) já nasceria
-- correto direto do seed, sem precisar deste INSERT.
--
-- Contexto (Fase 7 do módulo Satisfação do Cliente, resgate do prêmio da Roleta — `POST
-- /api/satisfacao-cliente/roleta/resgatar`): decisão do Matheus, depois da tarefa já revisada
-- e liberada pelo Teulis, de que Funcionário e Líder (perfis de quem de fato opera caixa/salão
-- no dia a dia — "líder e caixa", nas palavras dele; não existe perfil "Caixa" separado no
-- catálogo, então "caixa" foi mapeado pra "funcionario") também devem conseguir resgatar
-- prêmios, além dos cargos de gestão (administrador/gestor/gerente/supervisor) que já
-- conseguiam desde a Fase 7 original (herdado do nível EDITAR/TOTAL da chave do módulo inteiro
-- "satisfacao-cliente" — nenhuma mudança pra eles aqui).
--
-- Linha PRÓPRIA só para "funcionario"/"lider", restrita à subcategoria "roleta" (chave
-- composta "satisfacao-cliente:roleta") — nunca ao módulo inteiro: "Perguntas"/"Mesas" (as
-- outras 2 subcategorias de "satisfacao-cliente") continuam fora do alcance desses 2 perfis, e
-- só `canExecute` é concedido (não `canCreate`/`canEdit`/`canDelete` — resgatar não administra
-- o catálogo de prêmios, só executa o resgate de um giro já existente).
--
-- Os demais perfis (gestor/gerente/supervisor/administrador — já com `canExecute` via a chave
-- do módulo inteiro; marketing/financeiro — sem `canExecute`, sem mudança nenhuma pedida) de
-- propósito NÃO recebem nenhuma linha aqui: continuam herdando da chave do módulo inteiro sem
-- nenhuma alteração. Dar uma linha própria pra gestor/gerente/supervisor aqui também exigiria
-- replicar manualmente `canCreate`/`canEdit` (pra não regredir o CRUD de prêmios que eles já
-- têm hoje via o fallback pro módulo inteiro, ver `hasModulePermission` em src/lib/authz.ts) —
-- risco desnecessário: sem linha nenhuma, o fallback já resolve certo pra eles, exatamente como
-- resolve hoje.
--
-- ON CONFLICT DO NOTHING: idempotente e nunca sobrescreve uma customização manual já feita na
-- tela de Permissões (ex.: se algum admin já tiver criado à mão uma linha
-- "satisfacao-cliente:roleta" pra "funcionario" ou "lider" com outros valores antes desta
-- migration rodar, ela é respeitada e não é pisada).
INSERT INTO "ModulePermission" ("id", "profileId", "moduleKey", "canView", "canExecute", "canCreate", "canEdit", "canDelete")
SELECT
  pp."id" || '_satisfacao-cliente-roleta',
  pp."id",
  'satisfacao-cliente:roleta',
  true,
  true,
  false,
  false,
  false
FROM "PermissionProfile" pp
WHERE pp."key" IN ('funcionario', 'lider')
ON CONFLICT ("profileId", "moduleKey") DO NOTHING;
