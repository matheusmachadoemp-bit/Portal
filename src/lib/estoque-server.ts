import { prisma } from "@/lib/prisma";
import { spDateKey, spHours, spMinutes, weekdayFieldFor } from "@/lib/checklist";
import { createNotification } from "@/lib/notifications";

const COUNT_TYPE_LABEL: Record<string, string> = { SEMANAL: "semanal", MENSAL: "mensal" };

/**
 * Janela de tolerância (minutos) depois do horário configurado em que um lembrete ainda é
 * considerado "no horário" — cobre o cron (Vercel Cron nativo, a cada 15 min, ver
 * GET /api/estoque/contagens/lembretes/run e vercel.json) rodando com algum atraso/drift sem
 * deixar o aviso sair horas depois do horário pedido. `ultimoLembreteData` (ver abaixo) garante
 * que nunca duplica mesmo rodando várias vezes dentro da janela.
 */
const REMINDER_WINDOW_MINUTES = 30;

/**
 * Processa a agenda de lembretes de contagem de estoque (`StockCountSchedule`) — dispara uma
 * notificação (sino do portal + push) pro responsável de cada agendamento ativo cujo dia da
 * semana atual (fuso América/São_Paulo) esteja marcado e cujo horário configurado já tenha
 * chegado (dentro da janela de tolerância acima), ainda sem lembrete enviado hoje.
 *
 * Importante: isto NUNCA cria uma `StockCount` — é só um lembrete. Quem de fato inicia a
 * contagem continua sendo uma ação manual da pessoa em Estoque > Contagem de Estoque, como já
 * funciona hoje.
 *
 * Agendamentos sem `responsavelId` são ignorados (não há destinatário pra notificar).
 * Idempotente por dia: `ultimoLembreteData` ("YYYY-MM-DD" do último lembrete enviado) evita
 * notificar de novo o mesmo agendamento no mesmo dia, mesmo que o cron rode várias vezes dentro
 * da janela de tolerância.
 */
export async function processStockCountReminders(now: Date = new Date()): Promise<{ checked: number; notified: number }> {
  const dateKey = spDateKey(now);
  const weekdayField = weekdayFieldFor(dateKey);
  const currentMinutes = spHours(now) * 60 + spMinutes(now);

  const schedules = await prisma.stockCountSchedule.findMany({
    where: {
      active: true,
      responsavelId: { not: null },
      [weekdayField]: true,
      OR: [{ ultimoLembreteData: null }, { ultimoLembreteData: { not: dateKey } }],
    },
  });

  let notified = 0;
  for (const schedule of schedules) {
    const [h, m] = schedule.horario.split(":").map(Number);
    const horarioMinutes = h * 60 + m;
    const diff = currentMinutes - horarioMinutes;
    // Ainda não chegou a hora (diff < 0) ou o horário já passou faz tempo demais (fora da
    // janela de tolerância) — nos dois casos não notifica agora.
    if (diff < 0 || diff >= REMINDER_WINDOW_MINUTES) continue;

    await createNotification({
      userId: schedule.responsavelId!,
      type: "ESTOQUE_CONTAGEM_LEMBRETE",
      title: "Lembrete de contagem de estoque",
      body: `Hora de iniciar a contagem ${COUNT_TYPE_LABEL[schedule.type] ?? schedule.type.toLowerCase()}${
        schedule.setor ? ` do setor ${schedule.setor}` : ""
      }.`,
      priority: "INFORMACAO",
      url: "/portal/estoque/contagem",
    });
    await prisma.stockCountSchedule.update({ where: { id: schedule.id }, data: { ultimoLembreteData: dateKey } });
    notified++;
  }

  return { checked: schedules.length, notified };
}
