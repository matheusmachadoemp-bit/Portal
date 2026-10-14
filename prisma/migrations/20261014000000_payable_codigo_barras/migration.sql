-- Contas a Pagar: código de barras do boleto (ou "Pix copia e cola") lido pela câmera ou digitado
-- manualmente ao cadastrar a conta. Guarda o código certo (sem erro de digitação) para copiar
-- depois e pagar de qualquer lugar.
--
-- Unicidade GLOBAL (não por empresaId): decisão deliberada, não um esquecimento de escopo. Um
-- código de barras de boleto (ou um Pix "copia e cola") identifica UMA obrigação de pagamento no
-- mundo real — permitir o mesmo código em duas lojas diferentes permitiria o mesmo boleto ser
-- lançado (e pago) duas vezes, que é exatamente o problema que esta coluna existe para evitar.
-- Por isso o índice único abaixo é sobre a coluna isolada, sem empresaId na composição.
--
-- Nullable: nem todo lançamento vem de um boleto escaneado (ex.: salário, repasse manual). No
-- Postgres, uma coluna UNIQUE nullable aceita qualquer quantidade de linhas com NULL sem conflito
-- entre elas — só valores não nulos precisam ser distintos uns dos outros.
ALTER TABLE "Payable" ADD COLUMN     "codigoBarras" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Payable_codigoBarras_key" ON "Payable"("codigoBarras");
