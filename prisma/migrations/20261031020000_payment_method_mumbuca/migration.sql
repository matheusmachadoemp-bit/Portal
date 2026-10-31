-- Nova forma de pagamento "Mumbuca" (Contas a Pagar e Estoque > Compras) — moeda social/digital
-- real usada em Maricá-RJ, não erro de digitação (já existe "Conta Mumbuca - Nord" cadastrada como
-- conta bancária). Valor novo de enum: o Postgres não deixa USAR o valor na mesma transação em que
-- ele é criado, por isso esta migration só cria o valor (mesmo padrão de
-- 20260830210000_payment_method_novos_valores e 20261008000000_payment_method_boleto).
ALTER TYPE "PaymentMethod" ADD VALUE IF NOT EXISTS 'MUMBUCA';
