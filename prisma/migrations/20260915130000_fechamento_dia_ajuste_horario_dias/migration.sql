-- Migration de dado puro (sem alteração de schema) — ajusta o horário/dias de TODOS os
-- `FechamentoCargo` já existentes em produção para o mesmo valor que `prisma/seed.ts` passa a
-- usar (a partir de agora) para qualquer empresa nova (ver `create` do upsert em
-- `prisma/seed.ts`, bloco "Fechamento do Dia").
--
-- Pedido do usuário: o formulário do Fechamento do Dia libera às 23:35 e o prazo é a meia-noite
-- (00:00), 6x por semana — só as terças-feiras ficam de fora (folga da operação; mesmo critério
-- já usado em `ChecklistTemplate.terca`, que também nasce `@default(false)`).
--
-- Valor anterior (todo `FechamentoCargo` em produção hoje): `horarioLiberacao`='21:00',
-- `horarioLimite`='23:59', todos os 7 dias = true. Confirmado contra o histórico de migrations
-- em vez de against um SELECT em produção: a única migration que já tinha inserido linhas em
-- `FechamentoCargo` até aqui é `20260914130000_fechamento_dia_backfill_catalogo` (mesmos valores
-- que `prisma/seed.ts` já usava) — nenhuma migration alterou `horarioLiberacao`/`horarioLimite`/
-- dias depois disso, e não existe (ainda) nenhuma rota de API para editar um `FechamentoCargo`
-- ("CRUD via tela de Configurações é fase futura", comentário do model no schema) — ou seja, não
-- há caminho nenhum, hoje, para um cargo em produção ter saído desses valores.
--
-- "00:00" cruza a meia-noite: a partir desta migration, `dueAt` de uma `FechamentoSubmissao`
-- nova passa a ser calculado como o dia SEGUINTE ao `releaseAt` sempre que o horário-limite for
-- numericamente <= ao horário de liberação (ver `fechamentoReleaseEDueAt`, em
-- src/lib/fechamento.ts, e o comentário lá sobre por que isso é necessário). Essa lógica mora em
-- código, não aqui — esta migration só grava o "HH:mm" cru nas colunas, igual sempre foi;
-- nenhuma `FechamentoSubmissao` já existente é alterada (o prazo dela já foi calculado e fica
-- congelado desde a criação, mesmo comportamento de sempre).
--
-- Sem WHERE de "só quem ainda está no valor antigo": aplica para TODOS os `FechamentoCargo`,
-- sem exceção — não há hoje nenhuma customização real de um cargo individual para preservar (ver
-- parágrafo acima). Idempotente por natureza (grava sempre o mesmo valor final), então rodar de
-- novo no futuro (não deveria acontecer, migrations do Prisma só rodam uma vez) não teria efeito
-- colateral.
UPDATE "FechamentoCargo"
SET
  "horarioLiberacao" = '23:35',
  "horarioLimite" = '00:00',
  "segunda" = true,
  "terca" = false,
  "quarta" = true,
  "quinta" = true,
  "sexta" = true,
  "sabado" = true,
  "domingo" = true,
  "updatedAt" = CURRENT_TIMESTAMP;
