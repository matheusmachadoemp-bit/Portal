-- Novas formas de pagamento identificadas em importações reais de vendas
-- (ex.: "Pago Online" do iFood/99Food, "Fiado" de comandas/funcionários),
-- que antes caíam genericamente em "Outros".
ALTER TYPE "PaymentMethod" ADD VALUE IF NOT EXISTS 'PAGO_ONLINE';
ALTER TYPE "PaymentMethod" ADD VALUE IF NOT EXISTS 'FIADO';
