-- Ficha Técnica: gera o código de identificação dos produtos que JÁ existem.
--
-- Antes, o código do produto era digitado à mão (podia ser "001", "pizza1", repetido com
-- maiúscula/minúscula diferente etc.). Agora o sistema gera `PREFIXO-NNN` sozinho (PZ-001, BG-001,
-- SK-001...). Esta migração aplica o mesmo padrão aos produtos antigos:
--
--   * Produto que JÁ está no padrão `LETRAS-NÚMERO` (ex.: PZ-001, BG-012) NÃO é alterado.
--   * Só mudam os que estão fora do padrão (ex.: "001", "calabresa") e, se houver, o segundo de
--     dois códigos que significam o mesmo (ex.: "PZ-001" e "pz-001" ou "PZ-1").
--   * O prefixo é o mais usado pelos produtos que já estão no padrão na MESMA categoria; se a
--     categoria não tem nenhum, usa o padrão dela (PZ, CB, EF, AC, BG, BB, DR, SB, SK; "PR" no resto)
--     — a mesma regra de src/lib/ficha-code-core.ts, para a numeração não "bifurcar".
--   * O número é o próximo livre do prefixo no banco inteiro (Product.code é único no banco todo,
--     não por loja), na ordem em que os produtos foram criados (createdAt, id).
--   * O código ANTIGO fica guardado no AuditLog (before = código antigo, after = código novo), então
--     dá para consultar/desfazer depois. `updatedAt` do produto não é alterado.
--
-- Idempotente: depois de rodar, todos os códigos estão no padrão e uma segunda execução não altera nada.
-- Roda numa única transação (a do `prisma migrate deploy`): se algo falhar, nada é aplicado.

DO $$
DECLARE
  rec RECORD;
  v_prefix text;
  v_next numeric;
  v_new_code text;
BEGIN
  -- Contador do maior número já usado por prefixo (olhando todos os códigos no padrão, como o
  -- gerador do app: sem diferenciar maiúscula/minúscula e ignorando espaços nas pontas; e só
  -- números de até 6 dígitos, como o app, para um código gigante digitado à mão não virar a série).
  CREATE TEMP TABLE _codigo_contador ON COMMIT DROP AS
    SELECT upper(m[1]) AS prefixo, max(m[2]::numeric) AS maior
    FROM (
      SELECT regexp_match(btrim("code"), '^([A-Za-z]{1,6})-([0-9]{1,6})$') AS m
      FROM "Product"
    ) t
    WHERE m IS NOT NULL
    GROUP BY upper(m[1]);

  -- Prefixo por categoria: o mais comum entre os produtos JÁ no padrão (empate: ordem alfabética).
  CREATE TEMP TABLE _codigo_prefixo_categoria ON COMMIT DROP AS
    SELECT DISTINCT ON (categoria) categoria, prefixo
    FROM (
      SELECT "category"::text AS categoria, upper(m[1]) AS prefixo, count(*) AS qtd
      FROM (
        SELECT "category", regexp_match(btrim("code"), '^([A-Za-z]{1,6})-([0-9]+)$') AS m
        FROM "Product"
      ) t
      WHERE m IS NOT NULL
      GROUP BY "category"::text, upper(m[1])
    ) c
    ORDER BY categoria, qtd DESC, prefixo ASC;

  FOR rec IN
    WITH padrao AS (
      SELECT
        p."id",
        p."code",
        p."empresaId",
        p."category"::text AS categoria,
        p."createdAt",
        -- 1 = primeiro produto (por criação) com aquele código, ignorando maiúscula/minúscula e zeros
        -- à esquerda ("pz-001" e "PZ-1" contam como o mesmo código de "PZ-001")
        row_number() OVER (
          PARTITION BY COALESCE(
            (SELECT upper(m[1]) || '-' || m[2]::numeric::text
             FROM (SELECT regexp_match(btrim(p."code"), '^([A-Za-z]{1,6})-([0-9]+)$') AS m) x
             WHERE m IS NOT NULL),
            lower(btrim(p."code"))
          )
          ORDER BY p."createdAt", p."id"
        ) AS posicao
      FROM "Product" p
    )
    SELECT "id", "code", "empresaId", categoria
    FROM padrao
    WHERE "code" !~ '^[A-Za-z]{1,6}-[0-9]+$'
       OR posicao > 1
    ORDER BY "createdAt", "id"
  LOOP
    SELECT prefixo INTO v_prefix FROM _codigo_prefixo_categoria WHERE categoria = rec.categoria;
    IF v_prefix IS NULL THEN
      v_prefix := CASE rec.categoria
        WHEN 'PIZZA_SALGADA' THEN 'PZ'
        WHEN 'PIZZA_DOCE' THEN 'PZ'
        WHEN 'COMBO' THEN 'CB'
        WHEN 'ESFIHA_SALGADA' THEN 'EF'
        WHEN 'ESFIHA_DOCE' THEN 'EF'
        WHEN 'ACOMPANHAMENTO' THEN 'AC'
        WHEN 'BURGER' THEN 'BG'
        WHEN 'BEBIDA' THEN 'BB'
        WHEN 'DRINK' THEN 'DR'
        WHEN 'SOBREMESA' THEN 'SB'
        WHEN 'SUSHI' THEN 'SK'
        WHEN 'SASHIMI' THEN 'SK'
        WHEN 'TEMAKI' THEN 'SK'
        WHEN 'URAMAKI' THEN 'SK'
        WHEN 'HOT_ROLL' THEN 'SK'
        WHEN 'ENTRADA' THEN 'SK'
        WHEN 'DELIVERY' THEN 'SK'
        WHEN 'LA_CARTE' THEN 'SK'
        WHEN 'RODIZIO' THEN 'SK'
        ELSE 'PR'
      END;
    END IF;

    SELECT COALESCE(maior, 0) + 1 INTO v_next FROM _codigo_contador WHERE prefixo = v_prefix;
    IF v_next IS NULL THEN
      v_next := 1;
    END IF;
    -- Completa com zeros até 3 dígitos (001, 012, 123). Atenção: lpad() do Postgres CORTA o texto
    -- quando ele já é maior que o tamanho pedido (lpad('1000', 3, '0') = '100'), então só completa
    -- quando falta — igual ao padStart do código do app (1000 continua 1000).
    v_new_code := v_prefix || '-' ||
      CASE WHEN length(v_next::text) < 3 THEN lpad(v_next::text, 3, '0') ELSE v_next::text END;

    -- Atualiza o contador (ou cria a linha do prefixo, se ainda não existia).
    UPDATE _codigo_contador SET maior = v_next WHERE prefixo = v_prefix;
    IF NOT FOUND THEN
      INSERT INTO _codigo_contador (prefixo, maior) VALUES (v_prefix, v_next);
    END IF;

    UPDATE "Product" SET "code" = v_new_code WHERE "id" = rec."id";

    INSERT INTO "AuditLog" ("id", "userId", "empresaId", "action", "entityType", "entityId", "before", "after", "createdAt")
    VALUES (
      gen_random_uuid()::text,
      NULL,
      rec."empresaId",
      'UPDATE',
      'Product',
      rec."id",
      rec."code",
      v_new_code,
      CURRENT_TIMESTAMP
    );
  END LOOP;
END
$$;
