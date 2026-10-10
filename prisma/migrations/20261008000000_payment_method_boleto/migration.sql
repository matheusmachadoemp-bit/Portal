-- Nova forma de pagamento "Boleto" (Contas a Pagar, Estoque > Compras e importação de vendas).
-- Valor novo de enum: o Postgres não deixa USAR o valor na mesma transação em que ele é criado, por
-- isso esta migration só cria o valor (mesmo padrão de 20260830210000_payment_method_novos_valores).
ALTER TYPE "PaymentMethod" ADD VALUE IF NOT EXISTS 'BOLETO';
