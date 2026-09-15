-- A pedido do usuário: remove do menu lateral a subcategoria "Trilhas de
-- Aprendizagem" da categoria "Universidade Grupo Nord" — o conceito de
-- trilha foi descontinuado e todo o seu conteúdo real já foi absorvido pela
-- estrutura Curso -> Módulo -> Aula na migration anterior
-- (20260915130000_universidade_curso_modulo_aula), que também derrubou os
-- models TrainingTrack/TrainingTrackCourse. Esta migration só cuida do item
-- de menu em si. Mesmo padrão de hard delete já usado em
-- prisma/migrations/20260915120000_remove_relatorios_subcategoria_manutencao/migration.sql.
--
-- Importante: não mexe em nenhuma outra subcategoria de Universidade
-- (cursos, videoaulas, avaliações, certificados, colaboradores, ranking,
-- biblioteca, relatorios, gestor) nem em subcategorias "trilhas"/similares de
-- outras categorias (não existe nenhuma outra com essa key hoje).
DELETE FROM "Subcategory"
WHERE key = 'trilhas'
  AND "categoryId" = (SELECT id FROM "Category" WHERE key = 'universidade');
