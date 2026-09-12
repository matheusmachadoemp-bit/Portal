import { prisma } from "@/lib/prisma";
import { spDateKey, spDateTime, spStartOfDay, weekdayFieldFor } from "@/lib/checklist";
import { computeFechamentoStatus } from "@/lib/fechamento";

/**
 * Gera (de forma idempotente, via @@unique([cargoId, data])) as submissões
 * do dia `dateKey` para os cargos ativos das empresas informadas — só nos
 * dias da semana marcados no cargo. Mesmo papel de
 * `generateChecklistOccurrences` (src/lib/checklist-server.ts) para o
 * Checklist.
 */
export async function generateFechamentoSubmissoes(empresaIds: string[], dateKey: string = spDateKey()) {
  if (empresaIds.length === 0) return;

  const day = spStartOfDay(dateKey);
  const weekdayField = weekdayFieldFor(dateKey);

  const cargos = await prisma.fechamentoCargo.findMany({
    where: { empresaId: { in: empresaIds }, ativo: true, [weekdayField]: true },
    select: { id: true, empresaId: true, horarioLiberacao: true, horarioLimite: true },
  });

  await Promise.all(
    cargos.map((c) => {
      const releaseAt = spDateTime(dateKey, c.horarioLiberacao);
      const dueAt = spDateTime(dateKey, c.horarioLimite);
      return prisma.fechamentoSubmissao.upsert({
        where: { cargoId_data: { cargoId: c.id, data: day } },
        update: {},
        create: {
          empresaId: c.empresaId,
          cargoId: c.id,
          data: day,
          releaseAt,
          dueAt,
        },
      });
    })
  );
}

/** Recalcula (e persiste, se mudou) o status "ao vivo" de cada submissão. */
export async function refreshFechamentoStatuses(submissaoIds: string[]) {
  if (submissaoIds.length === 0) return;
  const submissoes = await prisma.fechamentoSubmissao.findMany({
    where: { id: { in: submissaoIds } },
    select: { id: true, dueAt: true, enviadoEm: true, status: true },
  });
  const now = new Date();
  await Promise.all(
    submissoes.map((s) => {
      const next = computeFechamentoStatus({ dueAt: s.dueAt, enviadoEm: s.enviadoEm, now });
      if (next === s.status) return null;
      return prisma.fechamentoSubmissao.update({ where: { id: s.id }, data: { status: next } });
    })
  );
}

/**
 * Gera (se necessário) e devolve as submissões do dia `dateKey` das
 * empresas informadas, com o status já atualizado no banco. Usado pela
 * rota de status do dia.
 */
export async function loadFechamentoSubmissoesDoDia(empresaIds: string[], dateKey: string = spDateKey()) {
  await generateFechamentoSubmissoes(empresaIds, dateKey);
  const day = spStartOfDay(dateKey);
  const submissoes = await prisma.fechamentoSubmissao.findMany({
    where: { empresaId: { in: empresaIds }, data: day },
  });
  if (submissoes.length > 0) {
    await refreshFechamentoStatuses(submissoes.map((s) => s.id));
  }
  return submissoes;
}
