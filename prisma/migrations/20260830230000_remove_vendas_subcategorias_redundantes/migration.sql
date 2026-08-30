-- A pedido do usuário: remove do menu lateral as subcategorias "Vendas por
-- Hora", "Vendas por Período", "Forma de Pagamento" e "Área de Entrega" da
-- categoria "Vendas" — os dados que elas mostravam já estão cobertos pela
-- subcategoria "Faturamento". As páginas e rotas correspondentes também
-- foram removidas do código nesta mesma atualização.
DELETE FROM "Subcategory"
WHERE key IN ('por-hora', 'periodo', 'pagamento', 'entrega')
  AND "categoryId" = (SELECT id FROM "Category" WHERE key = 'vendas');
