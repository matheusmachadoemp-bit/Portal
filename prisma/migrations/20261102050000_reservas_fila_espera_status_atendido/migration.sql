-- Fila de Espera (ajuste pós-redesign, tarefa "reservas-fila-espera-ajustes2"): novo status
-- "sentou" (ATENDIDO), distinto de CANCELADO/EXPIRADO. O Postgres não deixa USAR o valor na mesma
-- transação em que ele é criado, por isso esta migration só cria o valor (mesmo padrão de
-- 20261008000000_payment_method_boleto / 20260830210000_payment_method_novos_valores).
ALTER TYPE "ReservationWaitlistStatus" ADD VALUE IF NOT EXISTS 'ATENDIDO';
