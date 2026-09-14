-- Reunião Liderança (Parte B): model novo, do zero — não existia nenhuma
-- tabela própria até aqui (só o item "lideranca" no menu lateral, seed em
-- prisma/seed.ts, mostrando "Em construção").
--
-- LiderancaMeeting fica bem enxuto de propósito: "Resultado do período" é
-- 100% um resumo consolidado, computado ao vivo a partir das outras 4
-- reuniões do mesmo período (ver computeLiderancaResumo em
-- src/lib/reuniao-server.ts) — decisão desta migration foi NÃO duplicar
-- esses números em colunas próprias (ao contrário de GerenteMeeting, que
-- grava uma cópia no momento do fechamento), pra nunca ficar desatualizado
-- se Cozinha/Salão/Delivery/Gerente daquele período forem editados depois.
-- Por isso este model só guarda o que é genuinamente próprio da reunião de
-- Liderança: periodo, notas e autoria — mesmo padrão de
-- GerenteMeeting/SalaoMeeting/KitchenMeeting/DeliveryMeeting antes delas.
--
-- A seção "Fechamento do mês" da Liderança (indicadores de nível de
-- liderança que não pertencem a nenhuma área específica) não precisa de
-- nenhuma tabela nova: já usa ReuniaoCustomIndicator/ReuniaoCustomIndicatorValue
-- (criadas em 20260914150000_reuniao_custom_indicador_compartilhado) com
-- meetingKey = 'LIDERANCA'.
CREATE TABLE "LiderancaMeeting" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "periodo" TEXT NOT NULL,
    "notas" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LiderancaMeeting_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LiderancaMeeting_empresaId_periodo_key" ON "LiderancaMeeting"("empresaId", "periodo");

ALTER TABLE "LiderancaMeeting" ADD CONSTRAINT "LiderancaMeeting_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "LiderancaMeeting" ADD CONSTRAINT "LiderancaMeeting_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
