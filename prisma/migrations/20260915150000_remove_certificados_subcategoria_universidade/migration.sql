-- A pedido do usuário (item 10 de uma lista de atualizações): unifica as
-- subcategorias "Colaboradores" e "Certificados" da categoria "Universidade
-- Grupo Nord" em uma única tela. As duas mostravam informação sobre o mesmo
-- grupo de pessoas (progresso de treinamento e certificados emitidos), então
-- viraram duas seções da tela "Colaboradores" em vez de dois itens
-- separados no menu lateral — ver
-- src/app/portal/universidade/colaboradores/page.tsx (agora com as seções
-- "Progresso dos colaboradores" e "Certificados emitidos") e
-- src/app/portal/universidade/certificados/page.tsx (virou um redirect pra
-- /portal/universidade/colaboradores, pra não quebrar links antigos).
-- Mesmo padrão de hard delete já usado em
-- prisma/migrations/20260915140000_remove_trilhas_subcategoria_universidade/migration.sql.
--
-- Importante: não mexe em nenhuma outra subcategoria de Universidade
-- (dashboard, cursos, videoaulas, avaliações, ranking, biblioteca,
-- relatorios, gestor) — em especial não mexe em "relatorios", que é objeto
-- de outra tarefa em andamento em paralelo (item 9).
DELETE FROM "Subcategory"
WHERE key = 'certificados'
  AND "categoryId" = (SELECT id FROM "Category" WHERE key = 'universidade');
