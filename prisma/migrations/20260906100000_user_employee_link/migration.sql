-- Liga a conta de login ("User") à ficha de RH ("Employee"): hoje não
-- existe nenhuma FK entre os dois, o que obrigava src/lib/inicio.ts a
-- cruzar por e-mail/nome em tempo de execução (loadRotinaPesquisas,
-- loadRotinaMetas). O `UNIQUE` em "User"."employeeId" garante 1:1 nos dois
-- sentidos: nunca dois Users apontando pro mesmo Employee.

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "employeeId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "User_employeeId_key" ON "User"("employeeId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Backfill: liga automaticamente "User" <-> "Employee" quando o e-mail bate
-- de forma INEQUÍVOCA (case-insensitive, ignorando espaços nas pontas) —
-- ou seja, só quando existem exatamente 1 User (ainda sem "employeeId") e
-- exatamente 1 Employee (com e-mail preenchido) com aquele mesmo e-mail, e
-- nenhum dos dois já está ligado a outro registro.
--
-- Qualquer outro caso fica de fora e "employeeId" continua null: e-mail
-- duplicado/ambíguo dos dois lados (ex.: dois Employees com o mesmo
-- e-mail, ou dois Users cujos e-mails só diferem em maiúsculas/minúsculas),
-- e-mail vazio, ou um dos dois já ligado a outro registro. Quem ficar null
-- aqui continua funcionando pelo cruzamento antigo por e-mail/nome (agora
-- só como fallback) em src/lib/inicio.ts.
--
-- Validado manualmente contra uma base de teste com casos de e-mail
-- duplicado dos dois lados, e-mail vazio/nulo e registro já ligado, antes
-- de publicar esta migração.
-- ---------------------------------------------------------------------------
WITH normalized_employees AS (
  SELECT "id", lower(trim("email")) AS email_norm
  FROM "Employee"
  WHERE "email" IS NOT NULL AND trim("email") <> ''
),
normalized_users AS (
  SELECT "id", lower(trim("email")) AS email_norm
  FROM "User"
  WHERE "employeeId" IS NULL AND trim("email") <> ''
),
employee_email_counts AS (
  SELECT email_norm, COUNT(*) AS total, MIN("id") AS only_id
  FROM normalized_employees
  GROUP BY email_norm
),
user_email_counts AS (
  SELECT email_norm, COUNT(*) AS total
  FROM normalized_users
  GROUP BY email_norm
),
unambiguous_matches AS (
  SELECT nu."id" AS user_id, eec.only_id AS employee_id
  FROM normalized_users nu
  JOIN user_email_counts uec ON uec.email_norm = nu.email_norm
  JOIN employee_email_counts eec ON eec.email_norm = nu.email_norm
  WHERE uec.total = 1 AND eec.total = 1
)
UPDATE "User" u
SET "employeeId" = m.employee_id
FROM unambiguous_matches m
WHERE u."id" = m.user_id
  AND NOT EXISTS (
    SELECT 1 FROM "User" u2 WHERE u2."employeeId" = m.employee_id
  );
