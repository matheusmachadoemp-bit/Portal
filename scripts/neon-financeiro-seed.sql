-- Portal Nord — setup do módulo Financeiro + DRE (incremental)
-- Rode isso DEPOIS de aplicar o migration.sql da pasta financeiro_dre.

INSERT INTO "FinancialCategory" (id, name, type, "dreKey", active, "createdAt", "updatedAt")
VALUES
  (gen_random_uuid()::text, 'Faturamento de Produtos Restaurante', 'RECEITA', 'faturamento-produtos', true, now(), now()),
  (gen_random_uuid()::text, 'Faturamento de Taxa de Entrega Restaurante', 'RECEITA', 'faturamento-taxa-entrega', true, now(), now()),
  (gen_random_uuid()::text, 'Faturamento com Taxa de Serviço', 'RECEITA', 'faturamento-taxa-servico', true, now(), now()),
  (gen_random_uuid()::text, 'Faturamento com Comissão de Atendimento', 'RECEITA', 'faturamento-comissao-atendimento', true, now(), now()),
  (gen_random_uuid()::text, 'Acréscimos', 'RECEITA', 'acrescimos', true, now(), now()),
  (gen_random_uuid()::text, 'Outros Faturamentos', 'RECEITA', 'outros-faturamentos', true, now(), now()),
  (gen_random_uuid()::text, 'SIMPLES', 'DESPESA', 'simples', true, now(), now()),
  (gen_random_uuid()::text, 'ICMS', 'DESPESA', 'icms', true, now(), now()),
  (gen_random_uuid()::text, 'Outros Impostos', 'DESPESA', 'outros-impostos', true, now(), now()),
  (gen_random_uuid()::text, 'Custos Com Marketplace (Ifood+99)', 'CUSTO', 'marketplace', true, now(), now()),
  (gen_random_uuid()::text, 'Motoboy', 'CUSTO', 'motoboy', true, now(), now()),
  (gen_random_uuid()::text, 'Taxa de Entrega', 'CUSTO', 'taxa-entrega-custo', true, now(), now()),
  (gen_random_uuid()::text, 'Comissões e Gorjetas', 'CUSTO', 'comissoes-gorjetas', true, now(), now()),
  (gen_random_uuid()::text, 'Tarifas com Cartão', 'CUSTO', 'tarifas-cartao', true, now(), now()),
  (gen_random_uuid()::text, 'Descontos', 'CUSTO', 'descontos', true, now(), now()),
  (gen_random_uuid()::text, 'Custo com Tele entrega', 'CUSTO', 'custo-tele-entrega', true, now(), now()),
  (gen_random_uuid()::text, 'Vale sócios', 'CUSTO', 'vale-socios', true, now(), now()),
  (gen_random_uuid()::text, 'Insumos', 'CUSTO', 'insumos', true, now(), now()),
  (gen_random_uuid()::text, 'Gelo', 'CUSTO', 'gelo', true, now(), now()),
  (gen_random_uuid()::text, 'Bebidas', 'CUSTO', 'bebidas', true, now(), now()),
  (gen_random_uuid()::text, 'Mercadorias', 'CUSTO', 'mercadorias', true, now(), now()),
  (gen_random_uuid()::text, 'Mercado', 'CUSTO', 'mercado', true, now(), now()),
  (gen_random_uuid()::text, 'Balanço de estoque', 'CUSTO', 'balanco-estoque', true, now(), now()),
  (gen_random_uuid()::text, 'Embalagens', 'CUSTO', 'embalagens-item', true, now(), now()),
  (gen_random_uuid()::text, 'Descartáveis', 'CUSTO', 'descartaveis', true, now(), now()),
  (gen_random_uuid()::text, 'Bobinas e etiquetas', 'CUSTO', 'bobinas-etiquetas', true, now(), now()),
  (gen_random_uuid()::text, 'Balanço de Estoque Embalagem', 'CUSTO', 'balanco-estoque-embalagem', true, now(), now()),
  (gen_random_uuid()::text, 'Água', 'DESPESA', 'agua', true, now(), now()),
  (gen_random_uuid()::text, 'Advogada', 'DESPESA', 'advogada', true, now(), now()),
  (gen_random_uuid()::text, 'Aluguel de Imóvel', 'DESPESA', 'aluguel', true, now(), now()),
  (gen_random_uuid()::text, 'Cartão', 'DESPESA', 'cartao-despesa', true, now(), now()),
  (gen_random_uuid()::text, 'Contador', 'DESPESA', 'contador', true, now(), now()),
  (gen_random_uuid()::text, 'Consultoria e Assessoria', 'DESPESA', 'consultoria', true, now(), now()),
  (gen_random_uuid()::text, 'Consumos', 'DESPESA', 'consumos', true, now(), now()),
  (gen_random_uuid()::text, 'Dedetização', 'DESPESA', 'dedetizacao', true, now(), now()),
  (gen_random_uuid()::text, 'Luz - Energia elétrica', 'DESPESA', 'energia', true, now(), now()),
  (gen_random_uuid()::text, 'Limpeza', 'DESPESA', 'limpeza', true, now(), now()),
  (gen_random_uuid()::text, 'Material de Limpeza', 'DESPESA', 'material-limpeza', true, now(), now()),
  (gen_random_uuid()::text, 'Manutenção Geral', 'DESPESA', 'manutencao-geral', true, now(), now()),
  (gen_random_uuid()::text, 'Utensílios de Cozinha', 'DESPESA', 'utensilios-cozinha', true, now(), now()),
  (gen_random_uuid()::text, 'Gás', 'DESPESA', 'gas', true, now(), now()),
  (gen_random_uuid()::text, 'Sistemas e Softwares', 'DESPESA', 'sistemas-softwares', true, now(), now()),
  (gen_random_uuid()::text, 'Seguro', 'DESPESA', 'seguro', true, now(), now()),
  (gen_random_uuid()::text, 'Monitoramento/Segurança e Alarme', 'DESPESA', 'monitoramento-seguranca', true, now(), now()),
  (gen_random_uuid()::text, 'Telefone/ Internet', 'DESPESA', 'telefone-internet', true, now(), now()),
  (gen_random_uuid()::text, 'Despesas com Gasolina', 'DESPESA', 'gasolina', true, now(), now()),
  (gen_random_uuid()::text, 'Outras Despesas Administrativas', 'DESPESA', 'outras-despesas-administrativas', true, now(), now()),
  (gen_random_uuid()::text, 'Encargos Sociais (INSS, FGTS, Sindicatos, etc..)', 'DESPESA', 'encargos-sociais', true, now(), now()),
  (gen_random_uuid()::text, 'Médico do Trabalho / Exames', 'DESPESA', 'medico-trabalho', true, now(), now()),
  (gen_random_uuid()::text, 'Salários Fixos + Vale refeição', 'DESPESA', 'salarios-fixos', true, now(), now()),
  (gen_random_uuid()::text, 'Free e extras', 'DESPESA', 'free-extras', true, now(), now()),
  (gen_random_uuid()::text, 'Antecipações', 'DESPESA', 'antecipacoes', true, now(), now()),
  (gen_random_uuid()::text, 'Pró-Labore', 'DESPESA', 'pro-labore', true, now(), now()),
  (gen_random_uuid()::text, 'Aniversários Funcionários', 'DESPESA', 'aniversarios-funcionarios', true, now(), now()),
  (gen_random_uuid()::text, 'Nutricionista', 'DESPESA', 'nutricionista', true, now(), now()),
  (gen_random_uuid()::text, 'Massagem', 'DESPESA', 'massagem', true, now(), now()),
  (gen_random_uuid()::text, 'Bonificação', 'DESPESA', 'bonificacao', true, now(), now()),
  (gen_random_uuid()::text, 'Confraternização', 'DESPESA', 'confraternizacao', true, now(), now()),
  (gen_random_uuid()::text, 'Uniforme', 'DESPESA', 'uniforme', true, now(), now()),
  (gen_random_uuid()::text, 'Alimentação funcionários (lanche, reunião)', 'DESPESA', 'alimentacao-funcionarios', true, now(), now()),
  (gen_random_uuid()::text, 'Vale Transporte', 'DESPESA', 'vale-transporte', true, now(), now()),
  (gen_random_uuid()::text, 'PROVISÃO 13º', 'DESPESA', 'provisao-13', true, now(), now()),
  (gen_random_uuid()::text, 'Férias', 'DESPESA', 'ferias', true, now(), now()),
  (gen_random_uuid()::text, 'Outras Despesas com Pessoal', 'DESPESA', 'outras-despesas-pessoal', true, now(), now()),
  (gen_random_uuid()::text, 'Serviços de Marketing + Tráfego pago', 'DESPESA', 'servicos-marketing', true, now(), now()),
  (gen_random_uuid()::text, 'Fiado - Influencer', 'DESPESA', 'fiado-influencer', true, now(), now()),
  (gen_random_uuid()::text, 'Ads Online', 'DESPESA', 'ads-online', true, now(), now()),
  (gen_random_uuid()::text, 'Custos com Ações Offline', 'DESPESA', 'acoes-offline', true, now(), now()),
  (gen_random_uuid()::text, 'Juros', 'DESPESA', 'juros', true, now(), now()),
  (gen_random_uuid()::text, 'Tarifas Bancárias', 'DESPESA', 'tarifas-bancarias', true, now(), now()),
  (gen_random_uuid()::text, 'Vendas', 'RECEITA', 'vendas-ativo', true, now(), now()),
  (gen_random_uuid()::text, 'Empréstimos e aportes', 'RECEITA', 'emprestimos-aportes', true, now(), now()),
  (gen_random_uuid()::text, 'Dívidas Passadas', 'DESPESA', 'dividas-passadas', true, now(), now()),
  (gen_random_uuid()::text, 'Empréstimos', 'DESPESA', 'emprestimos-pagamento', true, now(), now()),
  (gen_random_uuid()::text, 'Equipamentos e Maquinários', 'INVESTIMENTO', 'equipamentos-maquinarios', true, now(), now()),
  (gen_random_uuid()::text, 'Reformas e benfeitorias', 'INVESTIMENTO', 'reformas-benfeitorias', true, now(), now()),
  (gen_random_uuid()::text, 'Rescisões', 'DESPESA', 'rescisoes', true, now(), now()),
  (gen_random_uuid()::text, 'Outras Despesas Não Operacionais', 'DESPESA', 'outras-despesas-nao-operacionais', true, now(), now()),
  (gen_random_uuid()::text, 'Retirada de Sócios / Divisão de Lucros', 'DESPESA', 'divisao-lucros-item', true, now(), now())
ON CONFLICT (name) DO NOTHING;

INSERT INTO "BankAccount" (id, name, bank, tipo, "saldoInicial", "saldoAtual", color, icon, active, "createdAt", "updatedAt")
VALUES
  (gen_random_uuid()::text, 'Banco Inter', 'Inter', 'Conta Corrente', 0, 0, '#f97316', 'Landmark', true, now(), now()),
  (gen_random_uuid()::text, 'Nubank', 'Nubank', 'Conta Corrente', 0, 0, '#a855f7', 'Landmark', true, now(), now()),
  (gen_random_uuid()::text, 'Mercado Pago', 'Mercado Pago', 'Conta Digital', 0, 0, '#2952E3', 'Wallet', true, now(), now()),
  (gen_random_uuid()::text, 'Caixa Físico', NULL, 'Caixa', 0, 0, '#22c55e', 'Banknote', true, now(), now());


-- Categoria "Financeiro" no menu lateral
INSERT INTO "Category" (id, key, name, icon, "order", "isSystem", "contentType", "createdAt", "updatedAt")
VALUES (gen_random_uuid()::text, 'financeiro', 'Financeiro', 'Wallet', 7, true, 'financeiro', now(), now())
ON CONFLICT (key) DO NOTHING;

INSERT INTO "Subcategory" (id, "categoryId", key, name, icon, "order", "isSystem", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, c.id, s.key, s.name, s.icon, s.ord, true, now(), now()
FROM "Category" c
JOIN (VALUES
  ('dashboard', 'Dashboard Financeiro', 'LayoutDashboard', 0),
  ('contas-a-pagar', 'Contas a Pagar', 'ArrowUpCircle', 1),
  ('contas-a-receber', 'Contas a Receber', 'ArrowDownCircle', 2),
  ('fluxo-de-caixa', 'Fluxo de Caixa', 'Waves', 3),
  ('caixa-da-empresa', 'Caixa da Empresa', 'Vault', 4),
  ('dre', 'DRE', 'FileBarChart', 5),
  ('categorias-financeiras', 'Categorias Financeiras', 'Tags', 6),
  ('contas-bancarias', 'Contas Bancárias', 'Landmark', 7),
  ('relatorios', 'Relatórios', 'FileSpreadsheet', 8)
) AS s(key, name, icon, ord) ON true
WHERE c.key = 'financeiro'
ON CONFLICT ("categoryId", key) DO NOTHING;

UPDATE "Category" SET "order" = 8 WHERE key = 'configuracoes';
UPDATE "Category" SET "order" = 9 WHERE key = 'usuarios';

