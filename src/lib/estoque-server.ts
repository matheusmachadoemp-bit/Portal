import { prisma } from "@/lib/prisma";
import { spDateKey, spDateTime, spHours, spMinutes, spStartOfDay, weekdayFieldFor } from "@/lib/checklist";
import { createNotification } from "@/lib/notifications";

const COUNT_TYPE_LABEL: Record<string, string> = { SEMANAL: "semanal", MENSAL: "mensal" };

/**
 * Monta os dados de `StockCountItem.create` pra uma nova `StockCount` — TODOS os `Ingredient`
 * ativos do setor informado (`setor: null` = todos os setores da empresa), ou só os ids
 * informados em `ingredientIds` quando a pessoa escolhe manualmente quais itens entram na
 * contagem (ver POST /api/estoque/contagens). Em ambos os casos o filtro `empresaId`/`setor`/
 * `active: true` continua aplicado — mesmo quando `ingredientIds` vem do corpo da requisição,
 * nunca inclui um ingrediente de outra loja/setor ou inativo só porque o id foi informado.
 *
 * Extraída daqui (em vez de inline na rota) pra ser compartilhada entre a criação manual (POST
 * /api/estoque/contagens) e a geração automática (`generateStockCounts` abaixo) — as duas
 * precisam montar exatamente a mesma lista de itens a partir de setor/empresa, nunca duplicada.
 */
export async function buildStockCountItemsData(
  empresaId: string,
  setor: string | null,
  ingredientIds?: string[]
): Promise<{ ingredientId: string; setor: string | null; estoqueEsperado: number }[]> {
  const ingredients = await prisma.ingredient.findMany({
    where: {
      empresaId,
      active: true,
      ...(setor ? { setor } : {}),
      ...(ingredientIds !== undefined ? { id: { in: ingredientIds } } : {}),
    },
    orderBy: { name: "asc" },
  });
  return ingredients.map((ing) => ({
    ingredientId: ing.id,
    setor: ing.setor,
    estoqueEsperado: ing.estoqueAtual,
  }));
}

/**
 * Gera (de forma idempotente, via `@@unique([scheduleId, dataContagem])`) a `StockCount` do dia
 * `dateKey` pra cada `StockCountSchedule` ativo das empresas informadas cujo dia da semana atual
 * (fuso América/São_Paulo) esteja marcado — espelha `generateChecklistOccurrences`
 * (src/lib/checklist-server.ts) o mais fiel possível:
 * - 1 chamada por `dateKey` (hoje), nunca um loop de dias — rodar de novo no mesmo dia é seguro e
 *   barato graças ao `upsert` (`update: {}` se já existe, `create` se não existe ainda).
 * - Sem `createdById` (ninguém "criou" manualmente — mesmo racional de `ChecklistOccurrence` não
 *   ter esse campo) e sem `responsavel` (nome livre, preenchido por quem de fato realiza a
 *   contagem na tela, igual contagens manuais hoje).
 * - `items` povoados com TODOS os `Ingredient` ativos do setor do agendamento — nunca seleção
 *   manual aqui, é geração automática (ver `buildStockCountItemsData` acima).
 * - `prazo` computado como `dataContagem + horarioLimite` quando o agendamento configura um
 *   horário-limite (mesma ideia de `ChecklistTemplate.dueTime` → `ChecklistOccurrence.dueAt`);
 *   `null` quando o agendamento não tem `horarioLimite`.
 * - `semana` sempre `null`: a criação manual (POST /api/estoque/contagens) também nunca calcula
 *   esse campo hoje — nenhuma tela envia `body.semana`, só fica disponível pra edição manual
 *   depois. Reaproveitar o comportamento atual significa não inventar aqui um cálculo que não
 *   existe no fluxo manual.
 */
export async function generateStockCounts(empresaIds: string[], dateKey: string = spDateKey()) {
  if (empresaIds.length === 0) return;

  const day = spStartOfDay(dateKey);
  const weekdayField = weekdayFieldFor(dateKey);
  const [anoStr, mesStr] = dateKey.split("-");
  const ano = Number(anoStr);
  const mes = Number(mesStr);

  // Só os campos usados para montar a contagem — o restante do agendamento (responsável,
  // horário do lembrete, etc.) não é lido aqui.
  const schedules = await prisma.stockCountSchedule.findMany({
    where: {
      empresaId: { in: empresaIds },
      active: true,
      [weekdayField]: true,
    },
    select: { id: true, empresaId: true, type: true, setor: true, horarioLimite: true },
  });

  await Promise.all(
    schedules.map(async (schedule) => {
      const items = await buildStockCountItemsData(schedule.empresaId, schedule.setor);
      const prazo = schedule.horarioLimite ? spDateTime(dateKey, schedule.horarioLimite) : null;
      return prisma.stockCount.upsert({
        where: { scheduleId_dataContagem: { scheduleId: schedule.id, dataContagem: day } },
        update: {},
        create: {
          empresaId: schedule.empresaId,
          type: schedule.type,
          setor: schedule.setor,
          scheduleId: schedule.id,
          dataContagem: day,
          ano,
          mes: schedule.type === "MENSAL" ? mes : null,
          semana: null,
          prazo,
          createdById: null,
          responsavel: null,
          // `status` fica no default do schema (`RASCUNHO`) e `checklistJson` fica `null` —
          // diferente da criação manual (POST /api/estoque/contagens), que já marca
          // `EM_ANDAMENTO`/inicializa o checklist porque ali é sempre uma pessoa clicando
          // "Iniciar contagem"/"Iniciar fechamento" agora. Aqui ninguém "iniciou" ainda; quem
          // abrir a contagem gerada é que efetivamente começa (mesmo racional de
          // `ChecklistOccurrence` nascer `AGENDADO`, não já "em andamento"). `checklistJson:
          // null` é seguro pro fechamento mensal: a tela já trata isso como "{}" ao abrir (ver
          // `contagem-mensal-client.tsx`, `setChecklist(c.checklistJson ? JSON.parse(...) :
          // {})`).
          items: { create: items },
        },
      });
    })
  );
}

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
 * Importante: esta função em si NUNCA cria uma `StockCount` — é só o lembrete (sino/push). Quem
 * efetivamente garante que a contagem do dia já existe é `generateStockCounts` (acima), chamada
 * pelo cron (GET /api/estoque/contagens/lembretes/run) ANTES desta — mesma ordem "gera primeiro,
 * notifica depois" de `generateChecklistOccurrences`/`processChecklistEscalations`. Quem realiza a
 * contagem (preenche os itens) continua sendo sempre uma pessoa, manualmente, em Estoque >
 * Contagem de Estoque — gerada automaticamente ou não, a `StockCount` nunca se preenche sozinha.
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
