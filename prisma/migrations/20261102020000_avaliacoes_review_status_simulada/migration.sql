-- Avaliações — adiciona o status SIMULADA ao enum ReviewStatus: modo "Simular" (botão novo em
-- Avaliações > Configurações, ver parâmetro `mode` de `syncEmpresaReviews` em
-- src/lib/review-sync.ts) gera a resposta via IA e passa pela checagem de palavra-chave de
-- risco normalmente, mas NUNCA publica no iFood — só para o usuário ver como as respostas
-- ficariam antes de ligar `avaliacoesAutoReplyEnabled` de vez para uma loja. Valor novo de
-- enum: o Postgres não deixa USAR o valor na mesma transação em que ele é criado, por isso
-- esta migration só cria o valor (mesmo padrão de 20261031020000_payment_method_mumbuca e
-- outras migrations de novo valor de enum deste projeto).
ALTER TYPE "ReviewStatus" ADD VALUE IF NOT EXISTS 'SIMULADA';
