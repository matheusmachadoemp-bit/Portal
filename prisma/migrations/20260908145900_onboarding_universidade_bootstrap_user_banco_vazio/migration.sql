-- Migration corretiva (sem alteração de schema) para o problema achado numa
-- validação "do zero" (banco só com o schema aplicado, zero usuários, antes
-- de QUALQUER seed): a migration seguinte nesta pasta,
-- 20260908150000_onboarding_universidade_curriculo, resolve o
-- "createdById" (FK obrigatória em TrainingCourse -> User) dos 10 cursos de
-- onboarding via
--   COALESCE(
--     (SELECT id FROM "User" WHERE role = 'ADMINISTRADOR' ORDER BY "createdAt" ASC LIMIT 1),
--     (SELECT id FROM "User" ORDER BY "createdAt" ASC LIMIT 1)
--   )
-- Num banco genuinamente vazio as duas subqueries do COALESCE retornam NULL
-- e a migration falha com P3018 (violação da constraint NOT NULL de
-- "createdById"), travando toda e qualquer migration seguinte até alguém
-- rodar `prisma migrate resolve` manualmente. Confirmado reproduzindo:
-- `prisma migrate deploy` do zero contra um Postgres vazio falha exatamente
-- assim, sempre na mesma linha.
--
-- Como 20260908150000_onboarding_universidade_curriculo já está mesclada e
-- aplicada em produção (editar o arquivo dela mudaria o checksum registrado
-- em "_prisma_migrations" e quebraria `prisma migrate deploy` em qualquer
-- ambiente que já rodou essa migration — o próprio Prisma recusa aplicar
-- history com checksum divergente de uma migration já aplicada), a correção
-- não pode alterar aquele arquivo. Em vez disso, esta migration nova entra
-- ANTES dela na ordem de aplicação (nome/timestamp
-- "20260908145900" < "20260908150000_..." — ela roda entre
-- 20260908140000_renomeia_course_senha_para_senha_cipher e
-- 20260908150000_onboarding_universidade_curriculo) e garante a
-- pré-condição que a migration seguinte já assumia como certa: pelo menos 1
-- "User" cadastrado.
--
-- O guard "WHERE NOT EXISTS (SELECT 1 FROM "User")" faz o INSERT abaixo só
-- acontecer quando a tabela "User" está genuinamente vazia:
--   - Banco do zero (o caso que estava quebrado): insere 1 usuário
--     placeholder ADMINISTRADOR, exatamente o mesmo contorno manual que já
--     era feito à mão antes de rodar a migration seguinte — só que agora
--     automático, então `prisma migrate deploy`/`migrate dev` aplicam o
--     histórico inteiro sem travar e sem nenhum passo manual. A migration
--     seguinte então encontra esse usuário via COALESCE (cai no primeiro
--     branch, já que role = 'ADMINISTRADOR') e segue normalmente.
--   - Produção real (ou qualquer banco que já tem usuário antes deste
--     ponto): a subquery NOT EXISTS acha usuário existente, o INSERT vira
--     no-op, e o restante do histórico se comporta exatamente igual a hoje
--     — nenhuma linha nova em "User", nenhuma mudança no resultado da
--     migration seguinte (que já resolveu createdById para um admin de
--     verdade quando rodou pela primeira vez, há meses).
--
-- "active" = false de propósito: este usuário existe só para satisfazer a
-- FK obrigatória de "TrainingCourse.createdById" num banco de teste/CI/dev
-- recém-criado, não é uma conta pra login de verdade (passwordHash é um
-- valor fixo que não corresponde a nenhuma senha real, então login por essa
-- conta nunca funcionaria mesmo se "active" fosse true). Se algum dia
-- alguém abrir a tela de Usuários num banco de teste que passou por este
-- caminho, o nome deixa claro que é um placeholder de bootstrap, seguro de
-- editar ou remover.
--
-- "id" via gen_random_uuid()::text (em vez de um UUID fixo, como o resto
-- desta migration original faz para os cursos): nada mais nesta migration
-- nem na seguinte referencia esse id diretamente — a migration seguinte
-- descobre o usuário de novo, por conta própria, via COALESCE — então não
-- precisa ser um literal fixo.
INSERT INTO "User" (
  "id", "name", "email", "passwordHash", "role", "active",
  "createdAt", "updatedAt"
)
SELECT
  gen_random_uuid()::text,
  'Bootstrap onboarding (placeholder)',
  'bootstrap-onboarding-universidade@sistema.internal',
  '!disabled-bootstrap-user-sem-senha-valida',
  'ADMINISTRADOR'::"Role",
  false,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "User");
