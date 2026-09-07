-- A pedido do usuário: remove do menu lateral as subcategorias "Dashboard",
-- "Equipe" e "Relatórios" da categoria "Marketing" — consideradas inúteis.
-- O conteúdo do dashboard continua acessível clicando na própria categoria
-- "Marketing" (rota /portal/marketing, que já renderiza o mesmo painel). As
-- páginas correspondentes também foram removidas do código nesta mesma
-- atualização.
DELETE FROM "Subcategory"
WHERE key IN ('dashboard', 'equipe', 'relatorios')
  AND "categoryId" = (SELECT id FROM "Category" WHERE key = 'marketing');
