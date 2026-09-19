-- AlterTable
ALTER TABLE "ChecklistTemplate" ALTER COLUMN "avisoAtrasoResponsavelMinutos" SET DEFAULT 15;

-- Pedido do dono: "após passar 15 minutos do horário limite do checklist,
-- precisa chegar uma notificação pro dono e um lembrete pro responsável ...
-- isso serve pra TODOS os checklists". Iguala o valor já salvo em todo
-- template existente, não só o default de templates novos — sem essa
-- atualização, templates criados antes desta migration continuariam com o
-- valor antigo (10 min) até alguém editá-los manualmente pela tela.
UPDATE "ChecklistTemplate" SET "avisoAtrasoResponsavelMinutos" = 15;
