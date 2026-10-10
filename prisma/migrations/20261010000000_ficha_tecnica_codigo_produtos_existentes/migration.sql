-- Ficha Técnica: gera o código de identificação dos produtos que JÁ existem.
--
-- Antes, o código do produto era digitado à mão (podia ser "001", "pizza1", vazio, repetido com
-- maiúscula/minúscula diferente etc.). Agora o sistema gera `PREFIXO-NNN` sozinho (PZ-001, BG-001,
-- SK-001...). Esta migração aplica o mesmo padrão aos produtos antigos:
--
--   * Produto que JÁ está no padrão `LETRAS-NÚMERO` (ex.: PZ-001, BG-012) NÃO é alterado
--     (se só tiver espaço sobrando nas pontas, o espaço é tirado e o código segue o mesmo).
--   * Só mudam os que estão fora do padrão (ex.: "001", "calabresa") e, se houver, o segundo de
--     dois códigos que significam o mesmo (ex.: "PZ-001" e "pz-001" ou "PZ-1").
--   * O prefixo é o mais usado pelos produtos que já estão no padrão na MESMA categoria (empate:
--     ordem alfabética); se a categoria não tem nenhum, usa o padrão dela (PZ, CB, EF, AC, BG, BB,
--     DR, SB, SK; "PR" no resto) — a mesma regra de src/lib/ficha-code-core.ts, para a numeração
--     não "bifurcar".
--   * O número é o próximo livre do prefixo no banco inteiro (Product.code é único no banco todo,
--     não por loja), na ordem em que os produtos foram criados (createdAt, id). Como no app, só
--     números de até 6 dígitos contam como "a sequência" (um "PZ-20261010123" digitado à mão não a
--     empurra para números absurdos).
--   * O código ANTIGO fica guardado no AuditLog: UMA linha por loja (action
--     'CODIGO_AUTOMATICO_LOTE', entityType 'Product'), com a lista {id, name, de, para} no campo
--     `after`. Assim dá para consultar/desfazer depois, sem lotar o painel de auditoria com uma
--     linha por produto. `updatedAt` do produto não é alterado.
--
-- Segurança do deploy (esta migração roda sozinha no build de produção):
--   * Trava a tabela Product para ESCRITA durante a migração (leituras continuam liberadas), para
--     ninguém cadastrar um produto no app no meio e roubar o número escolhido.
--   * Antes de cada UPDATE confere no banco se o código novo já existe (ou tem equivalente tipo
--     "PZ-0005") e, se existir, pula para o próximo número — um índice único violado derrubaria o build.
--   * Idempotente: depois de rodar, todos os códigos estão no padrão e sem repetição; uma segunda
--     execução não altera nada.
--   * Roda numa única transação (a do `prisma migrate deploy`): se algo falhar, nada é aplicado.

DO $$
DECLARE
  rec RECORD;
  v_prefix text;
  v_next numeric;
  v_new_code text;
BEGIN
  LOCK TABLE "Product" IN SHARE ROW EXCLUSIVE MODE;

  -- Foto dos códigos já "limpos" (sem espaço/tab/quebra de linha/NBSP nas pontas, como o trim() do
  -- app) e separados em PREFIXO + NÚMERO quando seguem o padrão.
  CREATE TEMP TABLE _codigo_norm ON COMMIT DROP AS
    SELECT
      p."id",
      p."empresaId",
      p."name",
      p."category"::text AS categoria,
      p."createdAt",
      p."code",
      btrim(p."code", E' \t\r\n\u00a0') AS limpo,
      upper((regexp_match(btrim(p."code", E' \t\r\n\u00a0'), '^([A-Za-z]{1,6})-([0-9]+)$'))[1]) AS prefixo,
      ((regexp_match(btrim(p."code", E' \t\r\n\u00a0'), '^([A-Za-z]{1,6})-([0-9]+)$'))[2])::numeric AS numero
    FROM "Product" p;

  -- Maior número já usado por prefixo (só a sequência: até 6 dígitos).
  CREATE TEMP TABLE _codigo_contador ON COMMIT DROP AS
    SELECT prefixo, max(numero) AS maior
    FROM _codigo_norm
    WHERE prefixo IS NOT NULL AND numero <= 999999
    GROUP BY prefixo;

  -- Prefixo por categoria: o mais comum entre os produtos JÁ no padrão (empate: ordem alfabética).
  CREATE TEMP TABLE _codigo_prefixo_categoria ON COMMIT DROP AS
    SELECT DISTINCT ON (categoria) categoria, prefixo
    FROM (
      SELECT categoria, prefixo, count(*) AS qtd
      FROM _codigo_norm
      WHERE prefixo IS NOT NULL
      GROUP BY categoria, prefixo
    ) c
    ORDER BY categoria, qtd DESC, prefixo ASC;

  -- O que foi alterado (vira o AuditLog no fim).
  CREATE TEMP TABLE _codigo_mudancas (
    ordem serial,
    "id" text,
    "empresaId" text,
    "name" text,
    de text,
    para text
  ) ON COMMIT DROP;

  FOR rec IN
    WITH ranqueado AS (
      SELECT
        n.*,
        -- 1 = o "dono" daquele código, ignorando maiúscula/minúscula e zeros à esquerda
        -- ("pz-001" e "PZ-1" contam como o mesmo código de "PZ-001"); entre equivalentes, o que já
        -- está escrito limpo ganha, depois o mais antigo.
        row_number() OVER (
          PARTITION BY CASE
            WHEN n.prefixo IS NOT NULL THEN n.prefixo || '-' || n.numero::text
            ELSE lower(n.limpo)
          END
          ORDER BY (n.code = n.limpo) DESC, n."createdAt", n."id"
        ) AS posicao
      FROM _codigo_norm n
    )
    SELECT "id", "empresaId", "name", "code", limpo, categoria, (prefixo IS NULL OR posicao > 1) AS renumerar
    FROM ranqueado
    WHERE prefixo IS NULL OR posicao > 1 OR "code" <> limpo
    ORDER BY "createdAt", "id"
  LOOP
    IF NOT rec.renumerar THEN
      -- Já está no padrão e é o único dono do código: só tira o espaço sobrando nas pontas.
      UPDATE "Product" SET "code" = rec.limpo WHERE "id" = rec."id";
      INSERT INTO _codigo_mudancas ("id", "empresaId", "name", de, para)
      VALUES (rec."id", rec."empresaId", rec."name", rec."code", rec.limpo);
      CONTINUE;
    END IF;

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

    LOOP
      -- Completa com zeros até 3 dígitos (001, 012, 123). Atenção: lpad() do Postgres CORTA o texto
      -- quando ele já é maior que o tamanho pedido (lpad('1000', 3, '0') = '100'), então só completa
      -- quando falta — igual ao padStart do código do app (1000 continua 1000).
      v_new_code := v_prefix || '-' ||
        CASE WHEN length(v_next::text) < 3 THEN lpad(v_next::text, 3, '0') ELSE v_next::text END;
      -- Confere no banco AGORA (com a tabela travada) se o código, ou um equivalente dele (outra
      -- caixa, zeros à esquerda, espaços), já existe; se existir, tenta o número seguinte.
      EXIT WHEN NOT EXISTS (
        SELECT 1
        FROM "Product" x
        WHERE lower(btrim(x."code", E' \t\r\n\u00a0')) = lower(v_new_code)
           OR (
             btrim(x."code", E' \t\r\n\u00a0') ~* ('^' || v_prefix || '-[0-9]+$')
             AND (regexp_match(btrim(x."code", E' \t\r\n\u00a0'), '-([0-9]+)$'))[1]::numeric = v_next
           )
      );
      v_next := v_next + 1;
    END LOOP;

    -- Atualiza o contador (ou cria a linha do prefixo, se ainda não existia).
    UPDATE _codigo_contador SET maior = v_next WHERE prefixo = v_prefix;
    IF NOT FOUND THEN
      INSERT INTO _codigo_contador (prefixo, maior) VALUES (v_prefix, v_next);
    END IF;

    UPDATE "Product" SET "code" = v_new_code WHERE "id" = rec."id";
    INSERT INTO _codigo_mudancas ("id", "empresaId", "name", de, para)
    VALUES (rec."id", rec."empresaId", rec."name", rec."code", v_new_code);
  END LOOP;

  -- Histórico: uma linha por loja com tudo que mudou nela.
  INSERT INTO "AuditLog" ("id", "userId", "empresaId", "action", "entityType", "entityId", "before", "after", "createdAt")
  SELECT
    gen_random_uuid()::text,
    NULL,
    "empresaId",
    'CODIGO_AUTOMATICO_LOTE',
    'Product',
    NULL,
    NULL,
    jsonb_agg(jsonb_build_object('id', "id", 'name', "name", 'de', de, 'para', para) ORDER BY ordem)::text,
    CURRENT_TIMESTAMP
  FROM _codigo_mudancas
  GROUP BY "empresaId";
END
$$;
