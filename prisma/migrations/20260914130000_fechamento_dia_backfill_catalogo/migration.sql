-- Backfill de dado (sem alteração de schema) — mesmo racional dos backfills de "cmv"/
-- "producao"/"manutencao"/"fechamento_dia_fase1"/"fechamento_dia_fase4_menu_e_ocorrencias":
-- scripts/migrate-deploy.sh só roda `prisma migrate deploy`, nunca `npm run db:seed`. A Fase 1
-- do Fechamento do Dia (20260912200000_fechamento_dia_fase1) já tinha feito esse backfill para
-- os PERFIS DE PERMISSÃO (ModulePermission) — mas não para o CATÁLOGO em si
-- (FechamentoCategoria/FechamentoCargo/FechamentoPergunta/FechamentoPerguntaCargo/
-- FechamentoPerguntaOpcao), que só era criado por `prisma/seed.ts`. Resultado real, confirmado
-- em produção: o módulo ficou 100% funcional (rotas, permissões, telas) mas sem nenhuma pergunta
-- cadastrada pra ninguém preencher — toda `Empresa` já existente nasceu (e continuaria nascendo,
-- pra qualquer empresa nova, até esta migration) sem catálogo nenhum.
--
-- Conteúdo: exatamente as 9 categorias e os 3 cargos (com todas as perguntas/condicionais/
-- opções literais) que `prisma/seed.ts` já cria hoje — gerado programaticamente a partir de um
-- banco de teste onde o seed real já tinha rodado e sido validado (nunca retranscrito à mão, pra
-- não arriscar erro de digitação nos textos das perguntas). Funciona para QUALQUER empresa que
-- exista no banco de destino no momento em que a migration roda (`FOR emp IN SELECT id FROM
-- "Empresa" LOOP`, mesmo padrão dos backfills de ModulePermission) — inclusive uma empresa criada
-- no futuro, antes desta migration existir: nesse caso ela simplesmente ainda não tem nenhuma
-- empresa cadastrada quando o loop roda, então não recebe nada agora (o catálogo de uma empresa
-- nova continua sendo responsabilidade do fluxo de cadastro dela, fora do escopo desta migration).
--
-- Idempotência: cada INSERT usa a mesma chave que `prisma/seed.ts` já usa para não duplicar —
-- `empresaId+nome` (categoria), `empresaId+key` (cargo), `empresaId+texto+perguntaPaiId`
-- (pergunta — sem índice único no banco de propósito, ver comentário do model no schema; a
-- checagem aqui é feita com SELECT antes do INSERT, igual ao próprio seed), `perguntaId+cargoId`
-- (ligação pergunta-cargo) e `perguntaId+texto` (opção de resposta). Nunca sobrescreve uma
-- customização manual já feita (os `ON CONFLICT ... DO UPDATE` só re-gravam a MESMA coluna que
-- define o conflito, nunca outra).
--
-- `createdById` (FK obrigatória em FechamentoCargo/FechamentoPergunta -> User): resolvido pelo
-- administrador mais antigo cadastrado, com fallback pro usuário mais antigo de qualquer cargo —
-- mesmo critério exato (mesmo COALESCE) já usado em
-- 20260908150000_onboarding_universidade_curriculo.
DO $$
DECLARE
  emp RECORD;
  autor TEXT;
  v_cmu0kfqzv009q1b7d54cthc9g TEXT;
  v_cmu0kfqzx009r1b7dqiipc3he TEXT;
  v_cmu0kfqzy009s1b7dljcnzv4j TEXT;
  v_cmu0kfqzy009t1b7d622ton4u TEXT;
  v_cmu0kfqzz009u1b7dksvzq9ex TEXT;
  v_cmu0kfr00009v1b7dnekszpza TEXT;
  v_cmu0kfr01009w1b7dtekevlsn TEXT;
  v_cmu0kfr02009x1b7d8b5d4twr TEXT;
  v_cmu0kfr03009y1b7dquhrrah2 TEXT;
  v_cmu0kfr05009z1b7d02awhnul TEXT;
  v_cmu0kfr0800a01b7d39els3ll TEXT;
  v_cmu0kfr0900a11b7dpooadhwn TEXT;
  v_cmu0kfr3z00bb1b7dz2qxdjal TEXT;
  v_cmu0kfr0j00a21b7drrvqh8u9 TEXT;
  v_cmu0kfr2700at1b7d1yvw8ds9 TEXT;
  v_cmu0kfr0q00a31b7dkk996gbq TEXT;
  v_cmu0kfr2b00au1b7do0toft3z TEXT;
  v_cmu0kfr4200bc1b7dspbdvm9l TEXT;
  v_cmu0kfr0y00a81b7dg9cafbgq TEXT;
  v_cmu0kfr2j00aw1b7djad726ep TEXT;
  v_cmu0kfr1600ad1b7d3ju73a12 TEXT;
  v_cmu0kfr4800be1b7dyzqo01kf TEXT;
  v_cmu0kfr4e00bg1b7din6nwpsm TEXT;
  v_cmu0kfr2p00ay1b7dhtcy74cf TEXT;
  v_cmu0kfr4k00bi1b7d6xnksu4c TEXT;
  v_cmu0kfr3100b01b7dw0uhjm55 TEXT;
  v_cmu0kfr2100ar1b7dhiku5qb5 TEXT;
  v_cmu0kfr3800b21b7dh26emt3j TEXT;
  v_cmu0kfr4q00bk1b7dyv7nalo1 TEXT;
  v_cmu0kfr2400as1b7di7opqbbb TEXT;
  v_cmu0kfr4w00bm1b7d0i9qqlep TEXT;
  v_cmu0kfr3e00b41b7dgzpb0uer TEXT;
  v_cmu0kfr3k00b61b7dpv6rxlxw TEXT;
  v_cmu0kfr5200bo1b7doaalov7z TEXT;
  v_cmu0kfr5a00bq1b7d9imzn8z4 TEXT;
  v_cmu0kfr3q00b81b7dihzt7m1e TEXT;
  v_cmu0kfr5e00br1b7di8j9wu87 TEXT;
  v_cmu0kfr3t00b91b7dslresjrj TEXT;
  v_cmu0kfr5h00bs1b7dsi5j9o6m TEXT;
  v_cmu0kfr3w00ba1b7d9s4130w2 TEXT;
  v_cmu0kfr5k00bt1b7d4q17fbiz TEXT;
  v_cmu0kfr2f00av1b7duqmqvhnq TEXT;
  v_cmu0kfr4500bd1b7dn9daephp TEXT;
  v_cmu0kfr1b00ae1b7dncexav67 TEXT;
  v_cmu0kfr4b00bf1b7d7ibu6kuj TEXT;
  v_cmu0kfr2m00ax1b7d6re15h8j TEXT;
  v_cmu0kfr1m00ao1b7dnohr6ggx TEXT;
  v_cmu0kfr2t00az1b7do4598n0a TEXT;
  v_cmu0kfr4h00bh1b7dla61oigs TEXT;
  v_cmu0kfr1u00ap1b7daq1dgki2 TEXT;
  v_cmu0kfr1x00aq1b7dq6azfmre TEXT;
  v_cmu0kfr3500b11b7d2cfq7htn TEXT;
  v_cmu0kfr4n00bj1b7d2esd9etx TEXT;
  v_cmu0kfr3b00b31b7dr3wec9r3 TEXT;
  v_cmu0kfr4t00bl1b7dm8snnrqr TEXT;
  v_cmu0kfr4z00bn1b7d3jmsihif TEXT;
  v_cmu0kfr3h00b51b7dptuyfnbc TEXT;
  v_cmu0kfr5500bp1b7domg177vx TEXT;
  v_cmu0kfr3n00b71b7d56gxu9y8 TEXT;
BEGIN
  -- Autor "de sistema" pra createdById (FK obrigatória): administrador mais antigo cadastrado,
  -- com fallback pro usuário mais antigo de qualquer cargo — mesmo critério exato (mesmo COALESCE)
  -- já usado em 20260908150000_onboarding_universidade_curriculo pra resolver createdById sem
  -- depender de conhecer o id de um usuário real de produção. Calculado uma vez só (não depende de
  -- qual empresa está sendo processada — ADMINISTRADOR é um cargo global no Portal, sem separação
  -- por loja).
  autor := COALESCE(
    (SELECT id FROM "User" WHERE role = 'ADMINISTRADOR' ORDER BY "createdAt" ASC LIMIT 1),
    (SELECT id FROM "User" ORDER BY "createdAt" ASC LIMIT 1)
  );
  IF autor IS NULL THEN
    RETURN; -- banco sem nenhum usuário ainda (vazio de verdade) — nada pra atribuir como autor, não roda o backfill.
  END IF;

  FOR emp IN SELECT id FROM "Empresa" LOOP
    -- Categorias
    INSERT INTO "FechamentoCategoria" (id, "empresaId", nome, icon, ordem, ativa) VALUES (gen_random_uuid()::text, emp.id, 'Equipe', 'AlertTriangle', 0, true)
      ON CONFLICT ("empresaId", nome) DO UPDATE SET nome = EXCLUDED.nome RETURNING id INTO v_cmu0kfqzv009q1b7d54cthc9g;
    INSERT INTO "FechamentoCategoria" (id, "empresaId", nome, icon, ordem, ativa) VALUES (gen_random_uuid()::text, emp.id, 'Cliente', 'AlertTriangle', 1, true)
      ON CONFLICT ("empresaId", nome) DO UPDATE SET nome = EXCLUDED.nome RETURNING id INTO v_cmu0kfqzx009r1b7dqiipc3he;
    INSERT INTO "FechamentoCategoria" (id, "empresaId", nome, icon, ordem, ativa) VALUES (gen_random_uuid()::text, emp.id, 'Produto', 'AlertTriangle', 2, true)
      ON CONFLICT ("empresaId", nome) DO UPDATE SET nome = EXCLUDED.nome RETURNING id INTO v_cmu0kfqzy009s1b7dljcnzv4j;
    INSERT INTO "FechamentoCategoria" (id, "empresaId", nome, icon, ordem, ativa) VALUES (gen_random_uuid()::text, emp.id, 'Equipamento', 'AlertTriangle', 3, true)
      ON CONFLICT ("empresaId", nome) DO UPDATE SET nome = EXCLUDED.nome RETURNING id INTO v_cmu0kfqzy009t1b7d622ton4u;
    INSERT INTO "FechamentoCategoria" (id, "empresaId", nome, icon, ordem, ativa) VALUES (gen_random_uuid()::text, emp.id, 'Delivery', 'AlertTriangle', 4, true)
      ON CONFLICT ("empresaId", nome) DO UPDATE SET nome = EXCLUDED.nome RETURNING id INTO v_cmu0kfqzz009u1b7dksvzq9ex;
    INSERT INTO "FechamentoCategoria" (id, "empresaId", nome, icon, ordem, ativa) VALUES (gen_random_uuid()::text, emp.id, 'Salão', 'AlertTriangle', 5, true)
      ON CONFLICT ("empresaId", nome) DO UPDATE SET nome = EXCLUDED.nome RETURNING id INTO v_cmu0kfr00009v1b7dnekszpza;
    INSERT INTO "FechamentoCategoria" (id, "empresaId", nome, icon, ordem, ativa) VALUES (gen_random_uuid()::text, emp.id, 'Cozinha', 'AlertTriangle', 6, true)
      ON CONFLICT ("empresaId", nome) DO UPDATE SET nome = EXCLUDED.nome RETURNING id INTO v_cmu0kfr01009w1b7dtekevlsn;
    INSERT INTO "FechamentoCategoria" (id, "empresaId", nome, icon, ordem, ativa) VALUES (gen_random_uuid()::text, emp.id, 'Estoque', 'AlertTriangle', 7, true)
      ON CONFLICT ("empresaId", nome) DO UPDATE SET nome = EXCLUDED.nome RETURNING id INTO v_cmu0kfr02009x1b7d8b5d4twr;
    INSERT INTO "FechamentoCategoria" (id, "empresaId", nome, icon, ordem, ativa) VALUES (gen_random_uuid()::text, emp.id, 'Outro', 'AlertTriangle', 8, true)
      ON CONFLICT ("empresaId", nome) DO UPDATE SET nome = EXCLUDED.nome RETURNING id INTO v_cmu0kfr03009y1b7dquhrrah2;

    -- Cargos
    INSERT INTO "FechamentoCargo" (id, "empresaId", key, nome, icon, ordem, ativo, "horarioLiberacao", "horarioLimite", segunda, terca, quarta, quinta, sexta, sabado, domingo, "avisoAntesMinutos", "avisoAtrasoResponsavelMinutos", "alertaCriticoMinutos", "createdById", "createdAt", "updatedAt")
      VALUES (gen_random_uuid()::text, emp.id, 'gerencia', 'Gerente', 'Briefcase', 0, true, '21:00', '23:59', true, true, true, true, true, true, true, 30, 10, 30, autor, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT ("empresaId", key) DO UPDATE SET key = EXCLUDED.key RETURNING id INTO v_cmu0kfr05009z1b7d02awhnul;
    INSERT INTO "FechamentoCargo" (id, "empresaId", key, nome, icon, ordem, ativo, "horarioLiberacao", "horarioLimite", segunda, terca, quarta, quinta, sexta, sabado, domingo, "avisoAntesMinutos", "avisoAtrasoResponsavelMinutos", "alertaCriticoMinutos", "createdById", "createdAt", "updatedAt")
      VALUES (gen_random_uuid()::text, emp.id, 'salao', 'Chef de Salão', 'Utensils', 1, true, '21:00', '23:59', true, true, true, true, true, true, true, 30, 10, 30, autor, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT ("empresaId", key) DO UPDATE SET key = EXCLUDED.key RETURNING id INTO v_cmu0kfr0800a01b7d39els3ll;
    INSERT INTO "FechamentoCargo" (id, "empresaId", key, nome, icon, ordem, ativo, "horarioLiberacao", "horarioLimite", segunda, terca, quarta, quinta, sexta, sabado, domingo, "avisoAntesMinutos", "avisoAtrasoResponsavelMinutos", "alertaCriticoMinutos", "createdById", "createdAt", "updatedAt")
      VALUES (gen_random_uuid()::text, emp.id, 'cozinha', 'Chef de Cozinha', 'ChefHat', 2, true, '21:00', '23:59', true, true, true, true, true, true, true, 30, 10, 30, autor, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT ("empresaId", key) DO UPDATE SET key = EXCLUDED.key RETURNING id INTO v_cmu0kfr0900a11b7dpooadhwn;

    -- Perguntas (raízes primeiro, depois filhas — a ordem da consulta já garante isso).
    -- FechamentoPergunta NÃO tem @@unique(empresaId, texto) (de propósito — ver comentário do model
    -- no schema: perguntas filhas repetem texto entre pais diferentes), então a idempotência aqui
    -- é a mesma que prisma/seed.ts já usa: procura por empresaId+texto+perguntaPaiId antes de criar,
    -- em vez de depender de um índice único do banco.
    SELECT id INTO v_cmu0kfr3z00bb1b7dz2qxdjal FROM "FechamentoPergunta" WHERE "empresaId" = emp.id AND texto = 'Como foi a cozinha hoje?' AND "perguntaPaiId" IS NOT DISTINCT FROM NULL;
    IF v_cmu0kfr3z00bb1b7dz2qxdjal IS NULL THEN
      INSERT INTO "FechamentoPergunta" (id, "empresaId", texto, orientacao, tipo, obrigatoria, ordem, ativa, "abreOcorrencia", "perguntaPaiId", "valorPaiQueExibe", "categoriaSugeridaId", "gravidadeSugerida", "createdById", "createdAt", "updatedAt")
        VALUES (gen_random_uuid()::text, emp.id, 'Como foi a cozinha hoje?', NULL, 'NOTA_1_5'::"FechamentoTipoResposta", true, 0, true, false, NULL, NULL, NULL, NULL, autor, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        RETURNING id INTO v_cmu0kfr3z00bb1b7dz2qxdjal;
    END IF;
    SELECT id INTO v_cmu0kfr0j00a21b7drrvqh8u9 FROM "FechamentoPergunta" WHERE "empresaId" = emp.id AND texto = 'Como você avalia a operação hoje?' AND "perguntaPaiId" IS NOT DISTINCT FROM NULL;
    IF v_cmu0kfr0j00a21b7drrvqh8u9 IS NULL THEN
      INSERT INTO "FechamentoPergunta" (id, "empresaId", texto, orientacao, tipo, obrigatoria, ordem, ativa, "abreOcorrencia", "perguntaPaiId", "valorPaiQueExibe", "categoriaSugeridaId", "gravidadeSugerida", "createdById", "createdAt", "updatedAt")
        VALUES (gen_random_uuid()::text, emp.id, 'Como você avalia a operação hoje?', NULL, 'NOTA_1_5'::"FechamentoTipoResposta", true, 0, true, false, NULL, NULL, NULL, NULL, autor, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        RETURNING id INTO v_cmu0kfr0j00a21b7drrvqh8u9;
    END IF;
    SELECT id INTO v_cmu0kfr2700at1b7d1yvw8ds9 FROM "FechamentoPergunta" WHERE "empresaId" = emp.id AND texto = 'Como foi o salão hoje?' AND "perguntaPaiId" IS NOT DISTINCT FROM NULL;
    IF v_cmu0kfr2700at1b7d1yvw8ds9 IS NULL THEN
      INSERT INTO "FechamentoPergunta" (id, "empresaId", texto, orientacao, tipo, obrigatoria, ordem, ativa, "abreOcorrencia", "perguntaPaiId", "valorPaiQueExibe", "categoriaSugeridaId", "gravidadeSugerida", "createdById", "createdAt", "updatedAt")
        VALUES (gen_random_uuid()::text, emp.id, 'Como foi o salão hoje?', NULL, 'NOTA_1_5'::"FechamentoTipoResposta", true, 0, true, false, NULL, NULL, NULL, NULL, autor, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        RETURNING id INTO v_cmu0kfr2700at1b7d1yvw8ds9;
    END IF;
    SELECT id INTO v_cmu0kfr0q00a31b7dkk996gbq FROM "FechamentoPergunta" WHERE "empresaId" = emp.id AND texto = 'Como foi o movimento da loja?' AND "perguntaPaiId" IS NOT DISTINCT FROM NULL;
    IF v_cmu0kfr0q00a31b7dkk996gbq IS NULL THEN
      INSERT INTO "FechamentoPergunta" (id, "empresaId", texto, orientacao, tipo, obrigatoria, ordem, ativa, "abreOcorrencia", "perguntaPaiId", "valorPaiQueExibe", "categoriaSugeridaId", "gravidadeSugerida", "createdById", "createdAt", "updatedAt")
        VALUES (gen_random_uuid()::text, emp.id, 'Como foi o movimento da loja?', NULL, 'MULTIPLA_ESCOLHA'::"FechamentoTipoResposta", true, 1, true, false, NULL, NULL, NULL, NULL, autor, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        RETURNING id INTO v_cmu0kfr0q00a31b7dkk996gbq;
    END IF;
    SELECT id INTO v_cmu0kfr2b00au1b7do0toft3z FROM "FechamentoPergunta" WHERE "empresaId" = emp.id AND texto = 'Houve reclamação de cliente?' AND "perguntaPaiId" IS NOT DISTINCT FROM NULL;
    IF v_cmu0kfr2b00au1b7do0toft3z IS NULL THEN
      INSERT INTO "FechamentoPergunta" (id, "empresaId", texto, orientacao, tipo, obrigatoria, ordem, ativa, "abreOcorrencia", "perguntaPaiId", "valorPaiQueExibe", "categoriaSugeridaId", "gravidadeSugerida", "createdById", "createdAt", "updatedAt")
        VALUES (gen_random_uuid()::text, emp.id, 'Houve reclamação de cliente?', NULL, 'SIM_NAO'::"FechamentoTipoResposta", true, 1, true, true, NULL, NULL, v_cmu0kfqzx009r1b7dqiipc3he, 'IMPORTANTE'::"FechamentoGravidade", autor, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        RETURNING id INTO v_cmu0kfr2b00au1b7do0toft3z;
    END IF;
    SELECT id INTO v_cmu0kfr4200bc1b7dspbdvm9l FROM "FechamentoPergunta" WHERE "empresaId" = emp.id AND texto = 'Produção foi suficiente?' AND "perguntaPaiId" IS NOT DISTINCT FROM NULL;
    IF v_cmu0kfr4200bc1b7dspbdvm9l IS NULL THEN
      INSERT INTO "FechamentoPergunta" (id, "empresaId", texto, orientacao, tipo, obrigatoria, ordem, ativa, "abreOcorrencia", "perguntaPaiId", "valorPaiQueExibe", "categoriaSugeridaId", "gravidadeSugerida", "createdById", "createdAt", "updatedAt")
        VALUES (gen_random_uuid()::text, emp.id, 'Produção foi suficiente?', NULL, 'SIM_NAO'::"FechamentoTipoResposta", true, 1, true, true, NULL, NULL, v_cmu0kfr01009w1b7dtekevlsn, 'ATENCAO'::"FechamentoGravidade", autor, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        RETURNING id INTO v_cmu0kfr4200bc1b7dspbdvm9l;
    END IF;
    SELECT id INTO v_cmu0kfr0y00a81b7dg9cafbgq FROM "FechamentoPergunta" WHERE "empresaId" = emp.id AND texto = 'Como estava a equipe?' AND "perguntaPaiId" IS NOT DISTINCT FROM NULL;
    IF v_cmu0kfr0y00a81b7dg9cafbgq IS NULL THEN
      INSERT INTO "FechamentoPergunta" (id, "empresaId", texto, orientacao, tipo, obrigatoria, ordem, ativa, "abreOcorrencia", "perguntaPaiId", "valorPaiQueExibe", "categoriaSugeridaId", "gravidadeSugerida", "createdById", "createdAt", "updatedAt")
        VALUES (gen_random_uuid()::text, emp.id, 'Como estava a equipe?', NULL, 'MULTIPLA_ESCOLHA'::"FechamentoTipoResposta", true, 2, true, false, NULL, NULL, NULL, NULL, autor, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        RETURNING id INTO v_cmu0kfr0y00a81b7dg9cafbgq;
    END IF;
    SELECT id INTO v_cmu0kfr2j00aw1b7djad726ep FROM "FechamentoPergunta" WHERE "empresaId" = emp.id AND texto = 'Houve elogio de cliente?' AND "perguntaPaiId" IS NOT DISTINCT FROM NULL;
    IF v_cmu0kfr2j00aw1b7djad726ep IS NULL THEN
      INSERT INTO "FechamentoPergunta" (id, "empresaId", texto, orientacao, tipo, obrigatoria, ordem, ativa, "abreOcorrencia", "perguntaPaiId", "valorPaiQueExibe", "categoriaSugeridaId", "gravidadeSugerida", "createdById", "createdAt", "updatedAt")
        VALUES (gen_random_uuid()::text, emp.id, 'Houve elogio de cliente?', NULL, 'SIM_NAO'::"FechamentoTipoResposta", true, 3, true, true, NULL, NULL, v_cmu0kfqzx009r1b7dqiipc3he, 'INFORMATIVO'::"FechamentoGravidade", autor, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        RETURNING id INTO v_cmu0kfr2j00aw1b7djad726ep;
    END IF;
    SELECT id INTO v_cmu0kfr1600ad1b7d3ju73a12 FROM "FechamentoPergunta" WHERE "empresaId" = emp.id AND texto = 'Houve algum problema relevante?' AND "perguntaPaiId" IS NOT DISTINCT FROM NULL;
    IF v_cmu0kfr1600ad1b7d3ju73a12 IS NULL THEN
      INSERT INTO "FechamentoPergunta" (id, "empresaId", texto, orientacao, tipo, obrigatoria, ordem, ativa, "abreOcorrencia", "perguntaPaiId", "valorPaiQueExibe", "categoriaSugeridaId", "gravidadeSugerida", "createdById", "createdAt", "updatedAt")
        VALUES (gen_random_uuid()::text, emp.id, 'Houve algum problema relevante?', NULL, 'SIM_NAO'::"FechamentoTipoResposta", true, 3, true, true, NULL, NULL, NULL, NULL, autor, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        RETURNING id INTO v_cmu0kfr1600ad1b7d3ju73a12;
    END IF;
    SELECT id INTO v_cmu0kfr4800be1b7dyzqo01kf FROM "FechamentoPergunta" WHERE "empresaId" = emp.id AND texto = 'Faltou algum insumo?' AND "perguntaPaiId" IS NOT DISTINCT FROM NULL;
    IF v_cmu0kfr4800be1b7dyzqo01kf IS NULL THEN
      INSERT INTO "FechamentoPergunta" (id, "empresaId", texto, orientacao, tipo, obrigatoria, ordem, ativa, "abreOcorrencia", "perguntaPaiId", "valorPaiQueExibe", "categoriaSugeridaId", "gravidadeSugerida", "createdById", "createdAt", "updatedAt")
        VALUES (gen_random_uuid()::text, emp.id, 'Faltou algum insumo?', NULL, 'SIM_NAO'::"FechamentoTipoResposta", true, 3, true, true, NULL, NULL, v_cmu0kfr02009x1b7d8b5d4twr, 'ATENCAO'::"FechamentoGravidade", autor, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        RETURNING id INTO v_cmu0kfr4800be1b7dyzqo01kf;
    END IF;
    SELECT id INTO v_cmu0kfr4e00bg1b7din6nwpsm FROM "FechamentoPergunta" WHERE "empresaId" = emp.id AND texto = 'Houve desperdício ou perda?' AND "perguntaPaiId" IS NOT DISTINCT FROM NULL;
    IF v_cmu0kfr4e00bg1b7din6nwpsm IS NULL THEN
      INSERT INTO "FechamentoPergunta" (id, "empresaId", texto, orientacao, tipo, obrigatoria, ordem, ativa, "abreOcorrencia", "perguntaPaiId", "valorPaiQueExibe", "categoriaSugeridaId", "gravidadeSugerida", "createdById", "createdAt", "updatedAt")
        VALUES (gen_random_uuid()::text, emp.id, 'Houve desperdício ou perda?', NULL, 'SIM_NAO'::"FechamentoTipoResposta", true, 5, true, true, NULL, NULL, v_cmu0kfr02009x1b7d8b5d4twr, 'ATENCAO'::"FechamentoGravidade", autor, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        RETURNING id INTO v_cmu0kfr4e00bg1b7din6nwpsm;
    END IF;
    SELECT id INTO v_cmu0kfr2p00ay1b7dhtcy74cf FROM "FechamentoPergunta" WHERE "empresaId" = emp.id AND texto = 'Alguma mesa teve demora?' AND "perguntaPaiId" IS NOT DISTINCT FROM NULL;
    IF v_cmu0kfr2p00ay1b7dhtcy74cf IS NULL THEN
      INSERT INTO "FechamentoPergunta" (id, "empresaId", texto, orientacao, tipo, obrigatoria, ordem, ativa, "abreOcorrencia", "perguntaPaiId", "valorPaiQueExibe", "categoriaSugeridaId", "gravidadeSugerida", "createdById", "createdAt", "updatedAt")
        VALUES (gen_random_uuid()::text, emp.id, 'Alguma mesa teve demora?', NULL, 'SIM_NAO'::"FechamentoTipoResposta", true, 5, true, true, NULL, NULL, v_cmu0kfr00009v1b7dnekszpza, 'ATENCAO'::"FechamentoGravidade", autor, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        RETURNING id INTO v_cmu0kfr2p00ay1b7dhtcy74cf;
    END IF;
    SELECT id INTO v_cmu0kfr4k00bi1b7d6xnksu4c FROM "FechamentoPergunta" WHERE "empresaId" = emp.id AND texto = 'Houve prato devolvido?' AND "perguntaPaiId" IS NOT DISTINCT FROM NULL;
    IF v_cmu0kfr4k00bi1b7d6xnksu4c IS NULL THEN
      INSERT INTO "FechamentoPergunta" (id, "empresaId", texto, orientacao, tipo, obrigatoria, ordem, ativa, "abreOcorrencia", "perguntaPaiId", "valorPaiQueExibe", "categoriaSugeridaId", "gravidadeSugerida", "createdById", "createdAt", "updatedAt")
        VALUES (gen_random_uuid()::text, emp.id, 'Houve prato devolvido?', NULL, 'SIM_NAO'::"FechamentoTipoResposta", true, 7, true, true, NULL, NULL, v_cmu0kfqzy009s1b7dljcnzv4j, 'IMPORTANTE'::"FechamentoGravidade", autor, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        RETURNING id INTO v_cmu0kfr4k00bi1b7d6xnksu4c;
    END IF;
    SELECT id INTO v_cmu0kfr3100b01b7dw0uhjm55 FROM "FechamentoPergunta" WHERE "empresaId" = emp.id AND texto = 'Houve erro de pedido?' AND "perguntaPaiId" IS NOT DISTINCT FROM NULL;
    IF v_cmu0kfr3100b01b7dw0uhjm55 IS NULL THEN
      INSERT INTO "FechamentoPergunta" (id, "empresaId", texto, orientacao, tipo, obrigatoria, ordem, ativa, "abreOcorrencia", "perguntaPaiId", "valorPaiQueExibe", "categoriaSugeridaId", "gravidadeSugerida", "createdById", "createdAt", "updatedAt")
        VALUES (gen_random_uuid()::text, emp.id, 'Houve erro de pedido?', NULL, 'SIM_NAO'::"FechamentoTipoResposta", true, 7, true, true, NULL, NULL, v_cmu0kfqzy009s1b7dljcnzv4j, 'ATENCAO'::"FechamentoGravidade", autor, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        RETURNING id INTO v_cmu0kfr3100b01b7dw0uhjm55;
    END IF;
    SELECT id INTO v_cmu0kfr2100ar1b7dhiku5qb5 FROM "FechamentoPergunta" WHERE "empresaId" = emp.id AND texto = 'O que funcionou bem hoje?' AND "perguntaPaiId" IS NOT DISTINCT FROM NULL;
    IF v_cmu0kfr2100ar1b7dhiku5qb5 IS NULL THEN
      INSERT INTO "FechamentoPergunta" (id, "empresaId", texto, orientacao, tipo, obrigatoria, ordem, ativa, "abreOcorrencia", "perguntaPaiId", "valorPaiQueExibe", "categoriaSugeridaId", "gravidadeSugerida", "createdById", "createdAt", "updatedAt")
        VALUES (gen_random_uuid()::text, emp.id, 'O que funcionou bem hoje?', NULL, 'TEXTO'::"FechamentoTipoResposta", false, 8, true, false, NULL, NULL, NULL, NULL, autor, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        RETURNING id INTO v_cmu0kfr2100ar1b7dhiku5qb5;
    END IF;
    SELECT id INTO v_cmu0kfr3800b21b7dh26emt3j FROM "FechamentoPergunta" WHERE "empresaId" = emp.id AND texto = 'Faltou algum produto?' AND "perguntaPaiId" IS NOT DISTINCT FROM NULL;
    IF v_cmu0kfr3800b21b7dh26emt3j IS NULL THEN
      INSERT INTO "FechamentoPergunta" (id, "empresaId", texto, orientacao, tipo, obrigatoria, ordem, ativa, "abreOcorrencia", "perguntaPaiId", "valorPaiQueExibe", "categoriaSugeridaId", "gravidadeSugerida", "createdById", "createdAt", "updatedAt")
        VALUES (gen_random_uuid()::text, emp.id, 'Faltou algum produto?', NULL, 'SIM_NAO'::"FechamentoTipoResposta", true, 9, true, true, NULL, NULL, v_cmu0kfr02009x1b7d8b5d4twr, 'ATENCAO'::"FechamentoGravidade", autor, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        RETURNING id INTO v_cmu0kfr3800b21b7dh26emt3j;
    END IF;
    SELECT id INTO v_cmu0kfr4q00bk1b7dyv7nalo1 FROM "FechamentoPergunta" WHERE "empresaId" = emp.id AND texto = 'Algum equipamento apresentou problema?' AND "perguntaPaiId" IS NOT DISTINCT FROM NULL;
    IF v_cmu0kfr4q00bk1b7dyv7nalo1 IS NULL THEN
      INSERT INTO "FechamentoPergunta" (id, "empresaId", texto, orientacao, tipo, obrigatoria, ordem, ativa, "abreOcorrencia", "perguntaPaiId", "valorPaiQueExibe", "categoriaSugeridaId", "gravidadeSugerida", "createdById", "createdAt", "updatedAt")
        VALUES (gen_random_uuid()::text, emp.id, 'Algum equipamento apresentou problema?', NULL, 'SIM_NAO'::"FechamentoTipoResposta", true, 9, true, true, NULL, NULL, v_cmu0kfqzy009t1b7d622ton4u, 'IMPORTANTE'::"FechamentoGravidade", autor, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        RETURNING id INTO v_cmu0kfr4q00bk1b7dyv7nalo1;
    END IF;
    SELECT id INTO v_cmu0kfr2400as1b7di7opqbbb FROM "FechamentoPergunta" WHERE "empresaId" = emp.id AND texto = 'O que precisamos melhorar amanhã?' AND "perguntaPaiId" IS NOT DISTINCT FROM NULL;
    IF v_cmu0kfr2400as1b7di7opqbbb IS NULL THEN
      INSERT INTO "FechamentoPergunta" (id, "empresaId", texto, orientacao, tipo, obrigatoria, ordem, ativa, "abreOcorrencia", "perguntaPaiId", "valorPaiQueExibe", "categoriaSugeridaId", "gravidadeSugerida", "createdById", "createdAt", "updatedAt")
        VALUES (gen_random_uuid()::text, emp.id, 'O que precisamos melhorar amanhã?', NULL, 'TEXTO'::"FechamentoTipoResposta", false, 9, true, false, NULL, NULL, NULL, NULL, autor, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        RETURNING id INTO v_cmu0kfr2400as1b7di7opqbbb;
    END IF;
    SELECT id INTO v_cmu0kfr4w00bm1b7d0i9qqlep FROM "FechamentoPergunta" WHERE "empresaId" = emp.id AND texto = 'Houve atraso relevante?' AND "perguntaPaiId" IS NOT DISTINCT FROM NULL;
    IF v_cmu0kfr4w00bm1b7d0i9qqlep IS NULL THEN
      INSERT INTO "FechamentoPergunta" (id, "empresaId", texto, orientacao, tipo, obrigatoria, ordem, ativa, "abreOcorrencia", "perguntaPaiId", "valorPaiQueExibe", "categoriaSugeridaId", "gravidadeSugerida", "createdById", "createdAt", "updatedAt")
        VALUES (gen_random_uuid()::text, emp.id, 'Houve atraso relevante?', NULL, 'SIM_NAO'::"FechamentoTipoResposta", true, 11, true, true, NULL, NULL, v_cmu0kfr01009w1b7dtekevlsn, 'ATENCAO'::"FechamentoGravidade", autor, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        RETURNING id INTO v_cmu0kfr4w00bm1b7d0i9qqlep;
    END IF;
    SELECT id INTO v_cmu0kfr3e00b41b7dgzpb0uer FROM "FechamentoPergunta" WHERE "empresaId" = emp.id AND texto = 'Algum garçom precisou de orientação?' AND "perguntaPaiId" IS NOT DISTINCT FROM NULL;
    IF v_cmu0kfr3e00b41b7dgzpb0uer IS NULL THEN
      INSERT INTO "FechamentoPergunta" (id, "empresaId", texto, orientacao, tipo, obrigatoria, ordem, ativa, "abreOcorrencia", "perguntaPaiId", "valorPaiQueExibe", "categoriaSugeridaId", "gravidadeSugerida", "createdById", "createdAt", "updatedAt")
        VALUES (gen_random_uuid()::text, emp.id, 'Algum garçom precisou de orientação?', NULL, 'SIM_NAO'::"FechamentoTipoResposta", true, 11, true, true, NULL, NULL, v_cmu0kfqzv009q1b7d54cthc9g, 'ATENCAO'::"FechamentoGravidade", autor, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        RETURNING id INTO v_cmu0kfr3e00b41b7dgzpb0uer;
    END IF;
    SELECT id INTO v_cmu0kfr3k00b61b7dpv6rxlxw FROM "FechamentoPergunta" WHERE "empresaId" = emp.id AND texto = 'Houve problema de limpeza/organização?' AND "perguntaPaiId" IS NOT DISTINCT FROM NULL;
    IF v_cmu0kfr3k00b61b7dpv6rxlxw IS NULL THEN
      INSERT INTO "FechamentoPergunta" (id, "empresaId", texto, orientacao, tipo, obrigatoria, ordem, ativa, "abreOcorrencia", "perguntaPaiId", "valorPaiQueExibe", "categoriaSugeridaId", "gravidadeSugerida", "createdById", "createdAt", "updatedAt")
        VALUES (gen_random_uuid()::text, emp.id, 'Houve problema de limpeza/organização?', NULL, 'SIM_NAO'::"FechamentoTipoResposta", true, 13, true, true, NULL, NULL, v_cmu0kfr00009v1b7dnekszpza, 'ATENCAO'::"FechamentoGravidade", autor, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        RETURNING id INTO v_cmu0kfr3k00b61b7dpv6rxlxw;
    END IF;
    SELECT id INTO v_cmu0kfr5200bo1b7doaalov7z FROM "FechamentoPergunta" WHERE "empresaId" = emp.id AND texto = 'Houve problema de padrão ou qualidade?' AND "perguntaPaiId" IS NOT DISTINCT FROM NULL;
    IF v_cmu0kfr5200bo1b7doaalov7z IS NULL THEN
      INSERT INTO "FechamentoPergunta" (id, "empresaId", texto, orientacao, tipo, obrigatoria, ordem, ativa, "abreOcorrencia", "perguntaPaiId", "valorPaiQueExibe", "categoriaSugeridaId", "gravidadeSugerida", "createdById", "createdAt", "updatedAt")
        VALUES (gen_random_uuid()::text, emp.id, 'Houve problema de padrão ou qualidade?', NULL, 'SIM_NAO'::"FechamentoTipoResposta", true, 13, true, true, NULL, NULL, v_cmu0kfqzy009s1b7dljcnzv4j, 'IMPORTANTE'::"FechamentoGravidade", autor, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        RETURNING id INTO v_cmu0kfr5200bo1b7doaalov7z;
    END IF;
    SELECT id INTO v_cmu0kfr5a00bq1b7d9imzn8z4 FROM "FechamentoPergunta" WHERE "empresaId" = emp.id AND texto = 'Produto que mais apresentou problema' AND "perguntaPaiId" IS NOT DISTINCT FROM NULL;
    IF v_cmu0kfr5a00bq1b7d9imzn8z4 IS NULL THEN
      INSERT INTO "FechamentoPergunta" (id, "empresaId", texto, orientacao, tipo, obrigatoria, ordem, ativa, "abreOcorrencia", "perguntaPaiId", "valorPaiQueExibe", "categoriaSugeridaId", "gravidadeSugerida", "createdById", "createdAt", "updatedAt")
        VALUES (gen_random_uuid()::text, emp.id, 'Produto que mais apresentou problema', NULL, 'PRODUTO'::"FechamentoTipoResposta", false, 15, true, false, NULL, NULL, NULL, NULL, autor, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        RETURNING id INTO v_cmu0kfr5a00bq1b7d9imzn8z4;
    END IF;
    SELECT id INTO v_cmu0kfr3q00b81b7dihzt7m1e FROM "FechamentoPergunta" WHERE "empresaId" = emp.id AND texto = 'Destaque positivo do salão hoje' AND "perguntaPaiId" IS NOT DISTINCT FROM NULL;
    IF v_cmu0kfr3q00b81b7dihzt7m1e IS NULL THEN
      INSERT INTO "FechamentoPergunta" (id, "empresaId", texto, orientacao, tipo, obrigatoria, ordem, ativa, "abreOcorrencia", "perguntaPaiId", "valorPaiQueExibe", "categoriaSugeridaId", "gravidadeSugerida", "createdById", "createdAt", "updatedAt")
        VALUES (gen_random_uuid()::text, emp.id, 'Destaque positivo do salão hoje', NULL, 'TEXTO'::"FechamentoTipoResposta", false, 15, true, false, NULL, NULL, NULL, NULL, autor, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        RETURNING id INTO v_cmu0kfr3q00b81b7dihzt7m1e;
    END IF;
    SELECT id INTO v_cmu0kfr5e00br1b7di8j9wu87 FROM "FechamentoPergunta" WHERE "empresaId" = emp.id AND texto = 'Principal motivo' AND "perguntaPaiId" IS NOT DISTINCT FROM NULL;
    IF v_cmu0kfr5e00br1b7di8j9wu87 IS NULL THEN
      INSERT INTO "FechamentoPergunta" (id, "empresaId", texto, orientacao, tipo, obrigatoria, ordem, ativa, "abreOcorrencia", "perguntaPaiId", "valorPaiQueExibe", "categoriaSugeridaId", "gravidadeSugerida", "createdById", "createdAt", "updatedAt")
        VALUES (gen_random_uuid()::text, emp.id, 'Principal motivo', NULL, 'TEXTO'::"FechamentoTipoResposta", false, 16, true, false, NULL, NULL, NULL, NULL, autor, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        RETURNING id INTO v_cmu0kfr5e00br1b7di8j9wu87;
    END IF;
    SELECT id INTO v_cmu0kfr3t00b91b7dslresjrj FROM "FechamentoPergunta" WHERE "empresaId" = emp.id AND texto = 'Principal problema do salão hoje' AND "perguntaPaiId" IS NOT DISTINCT FROM NULL;
    IF v_cmu0kfr3t00b91b7dslresjrj IS NULL THEN
      INSERT INTO "FechamentoPergunta" (id, "empresaId", texto, orientacao, tipo, obrigatoria, ordem, ativa, "abreOcorrencia", "perguntaPaiId", "valorPaiQueExibe", "categoriaSugeridaId", "gravidadeSugerida", "createdById", "createdAt", "updatedAt")
        VALUES (gen_random_uuid()::text, emp.id, 'Principal problema do salão hoje', NULL, 'TEXTO'::"FechamentoTipoResposta", false, 16, true, false, NULL, NULL, NULL, NULL, autor, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        RETURNING id INTO v_cmu0kfr3t00b91b7dslresjrj;
    END IF;
    SELECT id INTO v_cmu0kfr5h00bs1b7dsi5j9o6m FROM "FechamentoPergunta" WHERE "empresaId" = emp.id AND texto = 'O que precisa ser preparado, comprado ou corrigido amanhã?' AND "perguntaPaiId" IS NOT DISTINCT FROM NULL;
    IF v_cmu0kfr5h00bs1b7dsi5j9o6m IS NULL THEN
      INSERT INTO "FechamentoPergunta" (id, "empresaId", texto, orientacao, tipo, obrigatoria, ordem, ativa, "abreOcorrencia", "perguntaPaiId", "valorPaiQueExibe", "categoriaSugeridaId", "gravidadeSugerida", "createdById", "createdAt", "updatedAt")
        VALUES (gen_random_uuid()::text, emp.id, 'O que precisa ser preparado, comprado ou corrigido amanhã?', NULL, 'TEXTO'::"FechamentoTipoResposta", false, 17, true, false, NULL, NULL, NULL, NULL, autor, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        RETURNING id INTO v_cmu0kfr5h00bs1b7dsi5j9o6m;
    END IF;
    SELECT id INTO v_cmu0kfr3w00ba1b7d9s4130w2 FROM "FechamentoPergunta" WHERE "empresaId" = emp.id AND texto = 'Existe alguma pendência para amanhã?' AND "perguntaPaiId" IS NOT DISTINCT FROM NULL;
    IF v_cmu0kfr3w00ba1b7d9s4130w2 IS NULL THEN
      INSERT INTO "FechamentoPergunta" (id, "empresaId", texto, orientacao, tipo, obrigatoria, ordem, ativa, "abreOcorrencia", "perguntaPaiId", "valorPaiQueExibe", "categoriaSugeridaId", "gravidadeSugerida", "createdById", "createdAt", "updatedAt")
        VALUES (gen_random_uuid()::text, emp.id, 'Existe alguma pendência para amanhã?', NULL, 'TEXTO'::"FechamentoTipoResposta", false, 17, true, false, NULL, NULL, NULL, NULL, autor, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        RETURNING id INTO v_cmu0kfr3w00ba1b7d9s4130w2;
    END IF;
    SELECT id INTO v_cmu0kfr5k00bt1b7d4q17fbiz FROM "FechamentoPergunta" WHERE "empresaId" = emp.id AND texto = 'Anexar foto (opcional)' AND "perguntaPaiId" IS NOT DISTINCT FROM NULL;
    IF v_cmu0kfr5k00bt1b7d4q17fbiz IS NULL THEN
      INSERT INTO "FechamentoPergunta" (id, "empresaId", texto, orientacao, tipo, obrigatoria, ordem, ativa, "abreOcorrencia", "perguntaPaiId", "valorPaiQueExibe", "categoriaSugeridaId", "gravidadeSugerida", "createdById", "createdAt", "updatedAt")
        VALUES (gen_random_uuid()::text, emp.id, 'Anexar foto (opcional)', NULL, 'FOTO'::"FechamentoTipoResposta", false, 1000, true, false, NULL, NULL, NULL, NULL, autor, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        RETURNING id INTO v_cmu0kfr5k00bt1b7d4q17fbiz;
    END IF;
    SELECT id INTO v_cmu0kfr2f00av1b7duqmqvhnq FROM "FechamentoPergunta" WHERE "empresaId" = emp.id AND texto = 'Descrição' AND "perguntaPaiId" IS NOT DISTINCT FROM v_cmu0kfr2b00au1b7do0toft3z;
    IF v_cmu0kfr2f00av1b7duqmqvhnq IS NULL THEN
      INSERT INTO "FechamentoPergunta" (id, "empresaId", texto, orientacao, tipo, obrigatoria, ordem, ativa, "abreOcorrencia", "perguntaPaiId", "valorPaiQueExibe", "categoriaSugeridaId", "gravidadeSugerida", "createdById", "createdAt", "updatedAt")
        VALUES (gen_random_uuid()::text, emp.id, 'Descrição', NULL, 'TEXTO'::"FechamentoTipoResposta", false, 2, true, false, v_cmu0kfr2b00au1b7do0toft3z, 'true', NULL, NULL, autor, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        RETURNING id INTO v_cmu0kfr2f00av1b7duqmqvhnq;
    END IF;
    SELECT id INTO v_cmu0kfr4500bd1b7dn9daephp FROM "FechamentoPergunta" WHERE "empresaId" = emp.id AND texto = 'Descrição' AND "perguntaPaiId" IS NOT DISTINCT FROM v_cmu0kfr4200bc1b7dspbdvm9l;
    IF v_cmu0kfr4500bd1b7dn9daephp IS NULL THEN
      INSERT INTO "FechamentoPergunta" (id, "empresaId", texto, orientacao, tipo, obrigatoria, ordem, ativa, "abreOcorrencia", "perguntaPaiId", "valorPaiQueExibe", "categoriaSugeridaId", "gravidadeSugerida", "createdById", "createdAt", "updatedAt")
        VALUES (gen_random_uuid()::text, emp.id, 'Descrição', NULL, 'TEXTO'::"FechamentoTipoResposta", false, 2, true, false, v_cmu0kfr4200bc1b7dspbdvm9l, 'true', NULL, NULL, autor, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        RETURNING id INTO v_cmu0kfr4500bd1b7dn9daephp;
    END IF;
    SELECT id INTO v_cmu0kfr1b00ae1b7dncexav67 FROM "FechamentoPergunta" WHERE "empresaId" = emp.id AND texto = 'Categoria' AND "perguntaPaiId" IS NOT DISTINCT FROM v_cmu0kfr1600ad1b7d3ju73a12;
    IF v_cmu0kfr1b00ae1b7dncexav67 IS NULL THEN
      INSERT INTO "FechamentoPergunta" (id, "empresaId", texto, orientacao, tipo, obrigatoria, ordem, ativa, "abreOcorrencia", "perguntaPaiId", "valorPaiQueExibe", "categoriaSugeridaId", "gravidadeSugerida", "createdById", "createdAt", "updatedAt")
        VALUES (gen_random_uuid()::text, emp.id, 'Categoria', NULL, 'MULTIPLA_ESCOLHA'::"FechamentoTipoResposta", true, 4, true, false, v_cmu0kfr1600ad1b7d3ju73a12, 'true', NULL, NULL, autor, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        RETURNING id INTO v_cmu0kfr1b00ae1b7dncexav67;
    END IF;
    SELECT id INTO v_cmu0kfr4b00bf1b7d7ibu6kuj FROM "FechamentoPergunta" WHERE "empresaId" = emp.id AND texto = 'Descrição' AND "perguntaPaiId" IS NOT DISTINCT FROM v_cmu0kfr4800be1b7dyzqo01kf;
    IF v_cmu0kfr4b00bf1b7d7ibu6kuj IS NULL THEN
      INSERT INTO "FechamentoPergunta" (id, "empresaId", texto, orientacao, tipo, obrigatoria, ordem, ativa, "abreOcorrencia", "perguntaPaiId", "valorPaiQueExibe", "categoriaSugeridaId", "gravidadeSugerida", "createdById", "createdAt", "updatedAt")
        VALUES (gen_random_uuid()::text, emp.id, 'Descrição', NULL, 'TEXTO'::"FechamentoTipoResposta", false, 4, true, false, v_cmu0kfr4800be1b7dyzqo01kf, 'true', NULL, NULL, autor, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        RETURNING id INTO v_cmu0kfr4b00bf1b7d7ibu6kuj;
    END IF;
    SELECT id INTO v_cmu0kfr2m00ax1b7d6re15h8j FROM "FechamentoPergunta" WHERE "empresaId" = emp.id AND texto = 'Descrição' AND "perguntaPaiId" IS NOT DISTINCT FROM v_cmu0kfr2j00aw1b7djad726ep;
    IF v_cmu0kfr2m00ax1b7d6re15h8j IS NULL THEN
      INSERT INTO "FechamentoPergunta" (id, "empresaId", texto, orientacao, tipo, obrigatoria, ordem, ativa, "abreOcorrencia", "perguntaPaiId", "valorPaiQueExibe", "categoriaSugeridaId", "gravidadeSugerida", "createdById", "createdAt", "updatedAt")
        VALUES (gen_random_uuid()::text, emp.id, 'Descrição', NULL, 'TEXTO'::"FechamentoTipoResposta", false, 4, true, false, v_cmu0kfr2j00aw1b7djad726ep, 'true', NULL, NULL, autor, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        RETURNING id INTO v_cmu0kfr2m00ax1b7d6re15h8j;
    END IF;
    SELECT id INTO v_cmu0kfr1m00ao1b7dnohr6ggx FROM "FechamentoPergunta" WHERE "empresaId" = emp.id AND texto = 'O que aconteceu?' AND "perguntaPaiId" IS NOT DISTINCT FROM v_cmu0kfr1600ad1b7d3ju73a12;
    IF v_cmu0kfr1m00ao1b7dnohr6ggx IS NULL THEN
      INSERT INTO "FechamentoPergunta" (id, "empresaId", texto, orientacao, tipo, obrigatoria, ordem, ativa, "abreOcorrencia", "perguntaPaiId", "valorPaiQueExibe", "categoriaSugeridaId", "gravidadeSugerida", "createdById", "createdAt", "updatedAt")
        VALUES (gen_random_uuid()::text, emp.id, 'O que aconteceu?', NULL, 'TEXTO'::"FechamentoTipoResposta", true, 5, true, false, v_cmu0kfr1600ad1b7d3ju73a12, 'true', NULL, NULL, autor, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        RETURNING id INTO v_cmu0kfr1m00ao1b7dnohr6ggx;
    END IF;
    SELECT id INTO v_cmu0kfr2t00az1b7do4598n0a FROM "FechamentoPergunta" WHERE "empresaId" = emp.id AND texto = 'Descrição' AND "perguntaPaiId" IS NOT DISTINCT FROM v_cmu0kfr2p00ay1b7dhtcy74cf;
    IF v_cmu0kfr2t00az1b7do4598n0a IS NULL THEN
      INSERT INTO "FechamentoPergunta" (id, "empresaId", texto, orientacao, tipo, obrigatoria, ordem, ativa, "abreOcorrencia", "perguntaPaiId", "valorPaiQueExibe", "categoriaSugeridaId", "gravidadeSugerida", "createdById", "createdAt", "updatedAt")
        VALUES (gen_random_uuid()::text, emp.id, 'Descrição', NULL, 'TEXTO'::"FechamentoTipoResposta", false, 6, true, false, v_cmu0kfr2p00ay1b7dhtcy74cf, 'true', NULL, NULL, autor, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        RETURNING id INTO v_cmu0kfr2t00az1b7do4598n0a;
    END IF;
    SELECT id INTO v_cmu0kfr4h00bh1b7dla61oigs FROM "FechamentoPergunta" WHERE "empresaId" = emp.id AND texto = 'Descrição' AND "perguntaPaiId" IS NOT DISTINCT FROM v_cmu0kfr4e00bg1b7din6nwpsm;
    IF v_cmu0kfr4h00bh1b7dla61oigs IS NULL THEN
      INSERT INTO "FechamentoPergunta" (id, "empresaId", texto, orientacao, tipo, obrigatoria, ordem, ativa, "abreOcorrencia", "perguntaPaiId", "valorPaiQueExibe", "categoriaSugeridaId", "gravidadeSugerida", "createdById", "createdAt", "updatedAt")
        VALUES (gen_random_uuid()::text, emp.id, 'Descrição', NULL, 'TEXTO'::"FechamentoTipoResposta", false, 6, true, false, v_cmu0kfr4e00bg1b7din6nwpsm, 'true', NULL, NULL, autor, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        RETURNING id INTO v_cmu0kfr4h00bh1b7dla61oigs;
    END IF;
    SELECT id INTO v_cmu0kfr1u00ap1b7daq1dgki2 FROM "FechamentoPergunta" WHERE "empresaId" = emp.id AND texto = 'Como foi resolvido?' AND "perguntaPaiId" IS NOT DISTINCT FROM v_cmu0kfr1600ad1b7d3ju73a12;
    IF v_cmu0kfr1u00ap1b7daq1dgki2 IS NULL THEN
      INSERT INTO "FechamentoPergunta" (id, "empresaId", texto, orientacao, tipo, obrigatoria, ordem, ativa, "abreOcorrencia", "perguntaPaiId", "valorPaiQueExibe", "categoriaSugeridaId", "gravidadeSugerida", "createdById", "createdAt", "updatedAt")
        VALUES (gen_random_uuid()::text, emp.id, 'Como foi resolvido?', NULL, 'TEXTO'::"FechamentoTipoResposta", false, 6, true, false, v_cmu0kfr1600ad1b7d3ju73a12, 'true', NULL, NULL, autor, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        RETURNING id INTO v_cmu0kfr1u00ap1b7daq1dgki2;
    END IF;
    SELECT id INTO v_cmu0kfr1x00aq1b7dq6azfmre FROM "FechamentoPergunta" WHERE "empresaId" = emp.id AND texto = 'Ficou alguma pendência para amanhã?' AND "perguntaPaiId" IS NOT DISTINCT FROM v_cmu0kfr1600ad1b7d3ju73a12;
    IF v_cmu0kfr1x00aq1b7dq6azfmre IS NULL THEN
      INSERT INTO "FechamentoPergunta" (id, "empresaId", texto, orientacao, tipo, obrigatoria, ordem, ativa, "abreOcorrencia", "perguntaPaiId", "valorPaiQueExibe", "categoriaSugeridaId", "gravidadeSugerida", "createdById", "createdAt", "updatedAt")
        VALUES (gen_random_uuid()::text, emp.id, 'Ficou alguma pendência para amanhã?', NULL, 'TEXTO'::"FechamentoTipoResposta", false, 7, true, false, v_cmu0kfr1600ad1b7d3ju73a12, 'true', NULL, NULL, autor, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        RETURNING id INTO v_cmu0kfr1x00aq1b7dq6azfmre;
    END IF;
    SELECT id INTO v_cmu0kfr3500b11b7d2cfq7htn FROM "FechamentoPergunta" WHERE "empresaId" = emp.id AND texto = 'Descrição' AND "perguntaPaiId" IS NOT DISTINCT FROM v_cmu0kfr3100b01b7dw0uhjm55;
    IF v_cmu0kfr3500b11b7d2cfq7htn IS NULL THEN
      INSERT INTO "FechamentoPergunta" (id, "empresaId", texto, orientacao, tipo, obrigatoria, ordem, ativa, "abreOcorrencia", "perguntaPaiId", "valorPaiQueExibe", "categoriaSugeridaId", "gravidadeSugerida", "createdById", "createdAt", "updatedAt")
        VALUES (gen_random_uuid()::text, emp.id, 'Descrição', NULL, 'TEXTO'::"FechamentoTipoResposta", false, 8, true, false, v_cmu0kfr3100b01b7dw0uhjm55, 'true', NULL, NULL, autor, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        RETURNING id INTO v_cmu0kfr3500b11b7d2cfq7htn;
    END IF;
    SELECT id INTO v_cmu0kfr4n00bj1b7d2esd9etx FROM "FechamentoPergunta" WHERE "empresaId" = emp.id AND texto = 'Descrição' AND "perguntaPaiId" IS NOT DISTINCT FROM v_cmu0kfr4k00bi1b7d6xnksu4c;
    IF v_cmu0kfr4n00bj1b7d2esd9etx IS NULL THEN
      INSERT INTO "FechamentoPergunta" (id, "empresaId", texto, orientacao, tipo, obrigatoria, ordem, ativa, "abreOcorrencia", "perguntaPaiId", "valorPaiQueExibe", "categoriaSugeridaId", "gravidadeSugerida", "createdById", "createdAt", "updatedAt")
        VALUES (gen_random_uuid()::text, emp.id, 'Descrição', NULL, 'TEXTO'::"FechamentoTipoResposta", false, 8, true, false, v_cmu0kfr4k00bi1b7d6xnksu4c, 'true', NULL, NULL, autor, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        RETURNING id INTO v_cmu0kfr4n00bj1b7d2esd9etx;
    END IF;
    SELECT id INTO v_cmu0kfr3b00b31b7dr3wec9r3 FROM "FechamentoPergunta" WHERE "empresaId" = emp.id AND texto = 'Descrição' AND "perguntaPaiId" IS NOT DISTINCT FROM v_cmu0kfr3800b21b7dh26emt3j;
    IF v_cmu0kfr3b00b31b7dr3wec9r3 IS NULL THEN
      INSERT INTO "FechamentoPergunta" (id, "empresaId", texto, orientacao, tipo, obrigatoria, ordem, ativa, "abreOcorrencia", "perguntaPaiId", "valorPaiQueExibe", "categoriaSugeridaId", "gravidadeSugerida", "createdById", "createdAt", "updatedAt")
        VALUES (gen_random_uuid()::text, emp.id, 'Descrição', NULL, 'TEXTO'::"FechamentoTipoResposta", false, 10, true, false, v_cmu0kfr3800b21b7dh26emt3j, 'true', NULL, NULL, autor, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        RETURNING id INTO v_cmu0kfr3b00b31b7dr3wec9r3;
    END IF;
    SELECT id INTO v_cmu0kfr4t00bl1b7dm8snnrqr FROM "FechamentoPergunta" WHERE "empresaId" = emp.id AND texto = 'Descrição' AND "perguntaPaiId" IS NOT DISTINCT FROM v_cmu0kfr4q00bk1b7dyv7nalo1;
    IF v_cmu0kfr4t00bl1b7dm8snnrqr IS NULL THEN
      INSERT INTO "FechamentoPergunta" (id, "empresaId", texto, orientacao, tipo, obrigatoria, ordem, ativa, "abreOcorrencia", "perguntaPaiId", "valorPaiQueExibe", "categoriaSugeridaId", "gravidadeSugerida", "createdById", "createdAt", "updatedAt")
        VALUES (gen_random_uuid()::text, emp.id, 'Descrição', NULL, 'TEXTO'::"FechamentoTipoResposta", false, 10, true, false, v_cmu0kfr4q00bk1b7dyv7nalo1, 'true', NULL, NULL, autor, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        RETURNING id INTO v_cmu0kfr4t00bl1b7dm8snnrqr;
    END IF;
    SELECT id INTO v_cmu0kfr4z00bn1b7d3jmsihif FROM "FechamentoPergunta" WHERE "empresaId" = emp.id AND texto = 'Descrição' AND "perguntaPaiId" IS NOT DISTINCT FROM v_cmu0kfr4w00bm1b7d0i9qqlep;
    IF v_cmu0kfr4z00bn1b7d3jmsihif IS NULL THEN
      INSERT INTO "FechamentoPergunta" (id, "empresaId", texto, orientacao, tipo, obrigatoria, ordem, ativa, "abreOcorrencia", "perguntaPaiId", "valorPaiQueExibe", "categoriaSugeridaId", "gravidadeSugerida", "createdById", "createdAt", "updatedAt")
        VALUES (gen_random_uuid()::text, emp.id, 'Descrição', NULL, 'TEXTO'::"FechamentoTipoResposta", false, 12, true, false, v_cmu0kfr4w00bm1b7d0i9qqlep, 'true', NULL, NULL, autor, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        RETURNING id INTO v_cmu0kfr4z00bn1b7d3jmsihif;
    END IF;
    SELECT id INTO v_cmu0kfr3h00b51b7dptuyfnbc FROM "FechamentoPergunta" WHERE "empresaId" = emp.id AND texto = 'Descrição' AND "perguntaPaiId" IS NOT DISTINCT FROM v_cmu0kfr3e00b41b7dgzpb0uer;
    IF v_cmu0kfr3h00b51b7dptuyfnbc IS NULL THEN
      INSERT INTO "FechamentoPergunta" (id, "empresaId", texto, orientacao, tipo, obrigatoria, ordem, ativa, "abreOcorrencia", "perguntaPaiId", "valorPaiQueExibe", "categoriaSugeridaId", "gravidadeSugerida", "createdById", "createdAt", "updatedAt")
        VALUES (gen_random_uuid()::text, emp.id, 'Descrição', NULL, 'TEXTO'::"FechamentoTipoResposta", false, 12, true, false, v_cmu0kfr3e00b41b7dgzpb0uer, 'true', NULL, NULL, autor, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        RETURNING id INTO v_cmu0kfr3h00b51b7dptuyfnbc;
    END IF;
    SELECT id INTO v_cmu0kfr5500bp1b7domg177vx FROM "FechamentoPergunta" WHERE "empresaId" = emp.id AND texto = 'Descrição' AND "perguntaPaiId" IS NOT DISTINCT FROM v_cmu0kfr5200bo1b7doaalov7z;
    IF v_cmu0kfr5500bp1b7domg177vx IS NULL THEN
      INSERT INTO "FechamentoPergunta" (id, "empresaId", texto, orientacao, tipo, obrigatoria, ordem, ativa, "abreOcorrencia", "perguntaPaiId", "valorPaiQueExibe", "categoriaSugeridaId", "gravidadeSugerida", "createdById", "createdAt", "updatedAt")
        VALUES (gen_random_uuid()::text, emp.id, 'Descrição', NULL, 'TEXTO'::"FechamentoTipoResposta", false, 14, true, false, v_cmu0kfr5200bo1b7doaalov7z, 'true', NULL, NULL, autor, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        RETURNING id INTO v_cmu0kfr5500bp1b7domg177vx;
    END IF;
    SELECT id INTO v_cmu0kfr3n00b71b7d56gxu9y8 FROM "FechamentoPergunta" WHERE "empresaId" = emp.id AND texto = 'Descrição' AND "perguntaPaiId" IS NOT DISTINCT FROM v_cmu0kfr3k00b61b7dpv6rxlxw;
    IF v_cmu0kfr3n00b71b7d56gxu9y8 IS NULL THEN
      INSERT INTO "FechamentoPergunta" (id, "empresaId", texto, orientacao, tipo, obrigatoria, ordem, ativa, "abreOcorrencia", "perguntaPaiId", "valorPaiQueExibe", "categoriaSugeridaId", "gravidadeSugerida", "createdById", "createdAt", "updatedAt")
        VALUES (gen_random_uuid()::text, emp.id, 'Descrição', NULL, 'TEXTO'::"FechamentoTipoResposta", false, 14, true, false, v_cmu0kfr3k00b61b7dpv6rxlxw, 'true', NULL, NULL, autor, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        RETURNING id INTO v_cmu0kfr3n00b71b7d56gxu9y8;
    END IF;

    -- Ligação pergunta <-> cargo
    INSERT INTO "FechamentoPerguntaCargo" ("perguntaId", "cargoId") VALUES (v_cmu0kfr0j00a21b7drrvqh8u9, v_cmu0kfr05009z1b7d02awhnul) ON CONFLICT ("perguntaId", "cargoId") DO NOTHING;
    INSERT INTO "FechamentoPerguntaCargo" ("perguntaId", "cargoId") VALUES (v_cmu0kfr0q00a31b7dkk996gbq, v_cmu0kfr05009z1b7d02awhnul) ON CONFLICT ("perguntaId", "cargoId") DO NOTHING;
    INSERT INTO "FechamentoPerguntaCargo" ("perguntaId", "cargoId") VALUES (v_cmu0kfr0y00a81b7dg9cafbgq, v_cmu0kfr05009z1b7d02awhnul) ON CONFLICT ("perguntaId", "cargoId") DO NOTHING;
    INSERT INTO "FechamentoPerguntaCargo" ("perguntaId", "cargoId") VALUES (v_cmu0kfr1600ad1b7d3ju73a12, v_cmu0kfr05009z1b7d02awhnul) ON CONFLICT ("perguntaId", "cargoId") DO NOTHING;
    INSERT INTO "FechamentoPerguntaCargo" ("perguntaId", "cargoId") VALUES (v_cmu0kfr1b00ae1b7dncexav67, v_cmu0kfr05009z1b7d02awhnul) ON CONFLICT ("perguntaId", "cargoId") DO NOTHING;
    INSERT INTO "FechamentoPerguntaCargo" ("perguntaId", "cargoId") VALUES (v_cmu0kfr1m00ao1b7dnohr6ggx, v_cmu0kfr05009z1b7d02awhnul) ON CONFLICT ("perguntaId", "cargoId") DO NOTHING;
    INSERT INTO "FechamentoPerguntaCargo" ("perguntaId", "cargoId") VALUES (v_cmu0kfr1u00ap1b7daq1dgki2, v_cmu0kfr05009z1b7d02awhnul) ON CONFLICT ("perguntaId", "cargoId") DO NOTHING;
    INSERT INTO "FechamentoPerguntaCargo" ("perguntaId", "cargoId") VALUES (v_cmu0kfr1x00aq1b7dq6azfmre, v_cmu0kfr05009z1b7d02awhnul) ON CONFLICT ("perguntaId", "cargoId") DO NOTHING;
    INSERT INTO "FechamentoPerguntaCargo" ("perguntaId", "cargoId") VALUES (v_cmu0kfr2100ar1b7dhiku5qb5, v_cmu0kfr05009z1b7d02awhnul) ON CONFLICT ("perguntaId", "cargoId") DO NOTHING;
    INSERT INTO "FechamentoPerguntaCargo" ("perguntaId", "cargoId") VALUES (v_cmu0kfr2400as1b7di7opqbbb, v_cmu0kfr05009z1b7d02awhnul) ON CONFLICT ("perguntaId", "cargoId") DO NOTHING;
    INSERT INTO "FechamentoPerguntaCargo" ("perguntaId", "cargoId") VALUES (v_cmu0kfr2700at1b7d1yvw8ds9, v_cmu0kfr0800a01b7d39els3ll) ON CONFLICT ("perguntaId", "cargoId") DO NOTHING;
    INSERT INTO "FechamentoPerguntaCargo" ("perguntaId", "cargoId") VALUES (v_cmu0kfr2b00au1b7do0toft3z, v_cmu0kfr0800a01b7d39els3ll) ON CONFLICT ("perguntaId", "cargoId") DO NOTHING;
    INSERT INTO "FechamentoPerguntaCargo" ("perguntaId", "cargoId") VALUES (v_cmu0kfr2f00av1b7duqmqvhnq, v_cmu0kfr0800a01b7d39els3ll) ON CONFLICT ("perguntaId", "cargoId") DO NOTHING;
    INSERT INTO "FechamentoPerguntaCargo" ("perguntaId", "cargoId") VALUES (v_cmu0kfr2j00aw1b7djad726ep, v_cmu0kfr0800a01b7d39els3ll) ON CONFLICT ("perguntaId", "cargoId") DO NOTHING;
    INSERT INTO "FechamentoPerguntaCargo" ("perguntaId", "cargoId") VALUES (v_cmu0kfr2m00ax1b7d6re15h8j, v_cmu0kfr0800a01b7d39els3ll) ON CONFLICT ("perguntaId", "cargoId") DO NOTHING;
    INSERT INTO "FechamentoPerguntaCargo" ("perguntaId", "cargoId") VALUES (v_cmu0kfr2p00ay1b7dhtcy74cf, v_cmu0kfr0800a01b7d39els3ll) ON CONFLICT ("perguntaId", "cargoId") DO NOTHING;
    INSERT INTO "FechamentoPerguntaCargo" ("perguntaId", "cargoId") VALUES (v_cmu0kfr2t00az1b7do4598n0a, v_cmu0kfr0800a01b7d39els3ll) ON CONFLICT ("perguntaId", "cargoId") DO NOTHING;
    INSERT INTO "FechamentoPerguntaCargo" ("perguntaId", "cargoId") VALUES (v_cmu0kfr3100b01b7dw0uhjm55, v_cmu0kfr0800a01b7d39els3ll) ON CONFLICT ("perguntaId", "cargoId") DO NOTHING;
    INSERT INTO "FechamentoPerguntaCargo" ("perguntaId", "cargoId") VALUES (v_cmu0kfr3500b11b7d2cfq7htn, v_cmu0kfr0800a01b7d39els3ll) ON CONFLICT ("perguntaId", "cargoId") DO NOTHING;
    INSERT INTO "FechamentoPerguntaCargo" ("perguntaId", "cargoId") VALUES (v_cmu0kfr3800b21b7dh26emt3j, v_cmu0kfr0800a01b7d39els3ll) ON CONFLICT ("perguntaId", "cargoId") DO NOTHING;
    INSERT INTO "FechamentoPerguntaCargo" ("perguntaId", "cargoId") VALUES (v_cmu0kfr3b00b31b7dr3wec9r3, v_cmu0kfr0800a01b7d39els3ll) ON CONFLICT ("perguntaId", "cargoId") DO NOTHING;
    INSERT INTO "FechamentoPerguntaCargo" ("perguntaId", "cargoId") VALUES (v_cmu0kfr3e00b41b7dgzpb0uer, v_cmu0kfr0800a01b7d39els3ll) ON CONFLICT ("perguntaId", "cargoId") DO NOTHING;
    INSERT INTO "FechamentoPerguntaCargo" ("perguntaId", "cargoId") VALUES (v_cmu0kfr3h00b51b7dptuyfnbc, v_cmu0kfr0800a01b7d39els3ll) ON CONFLICT ("perguntaId", "cargoId") DO NOTHING;
    INSERT INTO "FechamentoPerguntaCargo" ("perguntaId", "cargoId") VALUES (v_cmu0kfr3k00b61b7dpv6rxlxw, v_cmu0kfr0800a01b7d39els3ll) ON CONFLICT ("perguntaId", "cargoId") DO NOTHING;
    INSERT INTO "FechamentoPerguntaCargo" ("perguntaId", "cargoId") VALUES (v_cmu0kfr3n00b71b7d56gxu9y8, v_cmu0kfr0800a01b7d39els3ll) ON CONFLICT ("perguntaId", "cargoId") DO NOTHING;
    INSERT INTO "FechamentoPerguntaCargo" ("perguntaId", "cargoId") VALUES (v_cmu0kfr3q00b81b7dihzt7m1e, v_cmu0kfr0800a01b7d39els3ll) ON CONFLICT ("perguntaId", "cargoId") DO NOTHING;
    INSERT INTO "FechamentoPerguntaCargo" ("perguntaId", "cargoId") VALUES (v_cmu0kfr3t00b91b7dslresjrj, v_cmu0kfr0800a01b7d39els3ll) ON CONFLICT ("perguntaId", "cargoId") DO NOTHING;
    INSERT INTO "FechamentoPerguntaCargo" ("perguntaId", "cargoId") VALUES (v_cmu0kfr3w00ba1b7d9s4130w2, v_cmu0kfr0800a01b7d39els3ll) ON CONFLICT ("perguntaId", "cargoId") DO NOTHING;
    INSERT INTO "FechamentoPerguntaCargo" ("perguntaId", "cargoId") VALUES (v_cmu0kfr3z00bb1b7dz2qxdjal, v_cmu0kfr0900a11b7dpooadhwn) ON CONFLICT ("perguntaId", "cargoId") DO NOTHING;
    INSERT INTO "FechamentoPerguntaCargo" ("perguntaId", "cargoId") VALUES (v_cmu0kfr4200bc1b7dspbdvm9l, v_cmu0kfr0900a11b7dpooadhwn) ON CONFLICT ("perguntaId", "cargoId") DO NOTHING;
    INSERT INTO "FechamentoPerguntaCargo" ("perguntaId", "cargoId") VALUES (v_cmu0kfr4500bd1b7dn9daephp, v_cmu0kfr0900a11b7dpooadhwn) ON CONFLICT ("perguntaId", "cargoId") DO NOTHING;
    INSERT INTO "FechamentoPerguntaCargo" ("perguntaId", "cargoId") VALUES (v_cmu0kfr4800be1b7dyzqo01kf, v_cmu0kfr0900a11b7dpooadhwn) ON CONFLICT ("perguntaId", "cargoId") DO NOTHING;
    INSERT INTO "FechamentoPerguntaCargo" ("perguntaId", "cargoId") VALUES (v_cmu0kfr4b00bf1b7d7ibu6kuj, v_cmu0kfr0900a11b7dpooadhwn) ON CONFLICT ("perguntaId", "cargoId") DO NOTHING;
    INSERT INTO "FechamentoPerguntaCargo" ("perguntaId", "cargoId") VALUES (v_cmu0kfr4e00bg1b7din6nwpsm, v_cmu0kfr0900a11b7dpooadhwn) ON CONFLICT ("perguntaId", "cargoId") DO NOTHING;
    INSERT INTO "FechamentoPerguntaCargo" ("perguntaId", "cargoId") VALUES (v_cmu0kfr4h00bh1b7dla61oigs, v_cmu0kfr0900a11b7dpooadhwn) ON CONFLICT ("perguntaId", "cargoId") DO NOTHING;
    INSERT INTO "FechamentoPerguntaCargo" ("perguntaId", "cargoId") VALUES (v_cmu0kfr4k00bi1b7d6xnksu4c, v_cmu0kfr0900a11b7dpooadhwn) ON CONFLICT ("perguntaId", "cargoId") DO NOTHING;
    INSERT INTO "FechamentoPerguntaCargo" ("perguntaId", "cargoId") VALUES (v_cmu0kfr4n00bj1b7d2esd9etx, v_cmu0kfr0900a11b7dpooadhwn) ON CONFLICT ("perguntaId", "cargoId") DO NOTHING;
    INSERT INTO "FechamentoPerguntaCargo" ("perguntaId", "cargoId") VALUES (v_cmu0kfr4q00bk1b7dyv7nalo1, v_cmu0kfr0900a11b7dpooadhwn) ON CONFLICT ("perguntaId", "cargoId") DO NOTHING;
    INSERT INTO "FechamentoPerguntaCargo" ("perguntaId", "cargoId") VALUES (v_cmu0kfr4t00bl1b7dm8snnrqr, v_cmu0kfr0900a11b7dpooadhwn) ON CONFLICT ("perguntaId", "cargoId") DO NOTHING;
    INSERT INTO "FechamentoPerguntaCargo" ("perguntaId", "cargoId") VALUES (v_cmu0kfr4w00bm1b7d0i9qqlep, v_cmu0kfr0900a11b7dpooadhwn) ON CONFLICT ("perguntaId", "cargoId") DO NOTHING;
    INSERT INTO "FechamentoPerguntaCargo" ("perguntaId", "cargoId") VALUES (v_cmu0kfr4z00bn1b7d3jmsihif, v_cmu0kfr0900a11b7dpooadhwn) ON CONFLICT ("perguntaId", "cargoId") DO NOTHING;
    INSERT INTO "FechamentoPerguntaCargo" ("perguntaId", "cargoId") VALUES (v_cmu0kfr5200bo1b7doaalov7z, v_cmu0kfr0900a11b7dpooadhwn) ON CONFLICT ("perguntaId", "cargoId") DO NOTHING;
    INSERT INTO "FechamentoPerguntaCargo" ("perguntaId", "cargoId") VALUES (v_cmu0kfr5500bp1b7domg177vx, v_cmu0kfr0900a11b7dpooadhwn) ON CONFLICT ("perguntaId", "cargoId") DO NOTHING;
    INSERT INTO "FechamentoPerguntaCargo" ("perguntaId", "cargoId") VALUES (v_cmu0kfr5a00bq1b7d9imzn8z4, v_cmu0kfr0900a11b7dpooadhwn) ON CONFLICT ("perguntaId", "cargoId") DO NOTHING;
    INSERT INTO "FechamentoPerguntaCargo" ("perguntaId", "cargoId") VALUES (v_cmu0kfr5e00br1b7di8j9wu87, v_cmu0kfr0900a11b7dpooadhwn) ON CONFLICT ("perguntaId", "cargoId") DO NOTHING;
    INSERT INTO "FechamentoPerguntaCargo" ("perguntaId", "cargoId") VALUES (v_cmu0kfr5h00bs1b7dsi5j9o6m, v_cmu0kfr0900a11b7dpooadhwn) ON CONFLICT ("perguntaId", "cargoId") DO NOTHING;
    INSERT INTO "FechamentoPerguntaCargo" ("perguntaId", "cargoId") VALUES (v_cmu0kfr5k00bt1b7d4q17fbiz, v_cmu0kfr05009z1b7d02awhnul) ON CONFLICT ("perguntaId", "cargoId") DO NOTHING;
    INSERT INTO "FechamentoPerguntaCargo" ("perguntaId", "cargoId") VALUES (v_cmu0kfr5k00bt1b7d4q17fbiz, v_cmu0kfr0800a01b7d39els3ll) ON CONFLICT ("perguntaId", "cargoId") DO NOTHING;
    INSERT INTO "FechamentoPerguntaCargo" ("perguntaId", "cargoId") VALUES (v_cmu0kfr5k00bt1b7d4q17fbiz, v_cmu0kfr0900a11b7dpooadhwn) ON CONFLICT ("perguntaId", "cargoId") DO NOTHING;

    -- Opções de resposta (MULTIPLA_ESCOLHA)
    INSERT INTO "FechamentoPerguntaOpcao" (id, "perguntaId", texto, ordem) VALUES (gen_random_uuid()::text, v_cmu0kfr0q00a31b7dkk996gbq, 'Fraco', 0) ON CONFLICT ("perguntaId", texto) DO NOTHING;
    INSERT INTO "FechamentoPerguntaOpcao" (id, "perguntaId", texto, ordem) VALUES (gen_random_uuid()::text, v_cmu0kfr0y00a81b7dg9cafbgq, 'Completa', 0) ON CONFLICT ("perguntaId", texto) DO NOTHING;
    INSERT INTO "FechamentoPerguntaOpcao" (id, "perguntaId", texto, ordem) VALUES (gen_random_uuid()::text, v_cmu0kfr1b00ae1b7dncexav67, 'Equipe', 0) ON CONFLICT ("perguntaId", texto) DO NOTHING;
    INSERT INTO "FechamentoPerguntaOpcao" (id, "perguntaId", texto, ordem) VALUES (gen_random_uuid()::text, v_cmu0kfr0q00a31b7dkk996gbq, 'Normal', 1) ON CONFLICT ("perguntaId", texto) DO NOTHING;
    INSERT INTO "FechamentoPerguntaOpcao" (id, "perguntaId", texto, ordem) VALUES (gen_random_uuid()::text, v_cmu0kfr1b00ae1b7dncexav67, 'Cliente', 1) ON CONFLICT ("perguntaId", texto) DO NOTHING;
    INSERT INTO "FechamentoPerguntaOpcao" (id, "perguntaId", texto, ordem) VALUES (gen_random_uuid()::text, v_cmu0kfr0y00a81b7dg9cafbgq, 'Falta', 1) ON CONFLICT ("perguntaId", texto) DO NOTHING;
    INSERT INTO "FechamentoPerguntaOpcao" (id, "perguntaId", texto, ordem) VALUES (gen_random_uuid()::text, v_cmu0kfr0q00a31b7dkk996gbq, 'Forte', 2) ON CONFLICT ("perguntaId", texto) DO NOTHING;
    INSERT INTO "FechamentoPerguntaOpcao" (id, "perguntaId", texto, ordem) VALUES (gen_random_uuid()::text, v_cmu0kfr0y00a81b7dg9cafbgq, 'Atraso', 2) ON CONFLICT ("perguntaId", texto) DO NOTHING;
    INSERT INTO "FechamentoPerguntaOpcao" (id, "perguntaId", texto, ordem) VALUES (gen_random_uuid()::text, v_cmu0kfr1b00ae1b7dncexav67, 'Produto', 2) ON CONFLICT ("perguntaId", texto) DO NOTHING;
    INSERT INTO "FechamentoPerguntaOpcao" (id, "perguntaId", texto, ordem) VALUES (gen_random_uuid()::text, v_cmu0kfr0y00a81b7dg9cafbgq, 'Problema de escala', 3) ON CONFLICT ("perguntaId", texto) DO NOTHING;
    INSERT INTO "FechamentoPerguntaOpcao" (id, "perguntaId", texto, ordem) VALUES (gen_random_uuid()::text, v_cmu0kfr0q00a31b7dkk996gbq, 'Muito Forte', 3) ON CONFLICT ("perguntaId", texto) DO NOTHING;
    INSERT INTO "FechamentoPerguntaOpcao" (id, "perguntaId", texto, ordem) VALUES (gen_random_uuid()::text, v_cmu0kfr1b00ae1b7dncexav67, 'Equipamento', 3) ON CONFLICT ("perguntaId", texto) DO NOTHING;
    INSERT INTO "FechamentoPerguntaOpcao" (id, "perguntaId", texto, ordem) VALUES (gen_random_uuid()::text, v_cmu0kfr1b00ae1b7dncexav67, 'Delivery', 4) ON CONFLICT ("perguntaId", texto) DO NOTHING;
    INSERT INTO "FechamentoPerguntaOpcao" (id, "perguntaId", texto, ordem) VALUES (gen_random_uuid()::text, v_cmu0kfr1b00ae1b7dncexav67, 'Salão', 5) ON CONFLICT ("perguntaId", texto) DO NOTHING;
    INSERT INTO "FechamentoPerguntaOpcao" (id, "perguntaId", texto, ordem) VALUES (gen_random_uuid()::text, v_cmu0kfr1b00ae1b7dncexav67, 'Cozinha', 6) ON CONFLICT ("perguntaId", texto) DO NOTHING;
    INSERT INTO "FechamentoPerguntaOpcao" (id, "perguntaId", texto, ordem) VALUES (gen_random_uuid()::text, v_cmu0kfr1b00ae1b7dncexav67, 'Estoque', 7) ON CONFLICT ("perguntaId", texto) DO NOTHING;
    INSERT INTO "FechamentoPerguntaOpcao" (id, "perguntaId", texto, ordem) VALUES (gen_random_uuid()::text, v_cmu0kfr1b00ae1b7dncexav67, 'Outro', 8) ON CONFLICT ("perguntaId", texto) DO NOTHING;
  END LOOP;
END $$;
