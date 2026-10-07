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
 *   barato: `StockCountSchedule.ultimaGeracaoData` reivindica o dia/mês de forma atômica (mensal:
 *   1 contagem por mês) e só gera a partir do horário da agenda.
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
export async function generateStockCounts(
  empresaIds: string[],
  dateKey: string = spDateKey(),
  now: Date = new Date()
) {
  if (empresaIds.length === 0) return;

  const day = spStartOfDay(dateKey);
  const weekdayField = weekdayFieldFor(dateKey);
  const [anoStr, mesStr] = dateKey.split("-");
  const ano = Number(anoStr);
  const mes = Number(mesStr);
  const monthPrefix = `${anoStr}-${mesStr}`;
  const hoje = spDateKey(now) === dateKey;
  const currentMinutes = spHours(now) * 60 + spMinutes(now);

  const schedules = await prisma.stockCountSchedule.findMany({
    where: {
      empresaId: { in: empresaIds },
      active: true,
      [weekdayField]: true,
    },
    select: {
      id: true,
      empresaId: true,
      type: true,
      setor: true,
      horario: true,
      horarioLimite: true,
      ultimaGeracaoData: true,
    },
  });

  // Uma agenda por vez e cada uma isolada em try/catch: um erro numa agenda não pode impedir as
  // outras (nem os lembretes, que rodam depois no mesmo cron) de seguirem.
  for (const schedule of schedules) {
    try {
      // A contagem só nasce quando chega o horário da agenda: `estoqueEsperado` é uma foto do
      // estoque no momento da geração, e fotografar à meia-noite faria qualquer entrega/perda
      // do começo do dia virar "divergência" falsa. (Datas retroativas passadas pra `dateKey`
      // não têm "agora" pra comparar, então geram direto.)
      if (hoje) {
        const [h, m] = schedule.horario.split(":").map(Number);
        if (currentMinutes < h * 60 + m) continue;
      }

      // Reivindicação atômica do dia (semanal) ou do mês (mensal — 1 fechamento por mês, no
      // primeiro dia marcado da agenda, não uma contagem completa por dia marcado). Só quem
      // consegue gravar `ultimaGeracaoData` cria a contagem: crons simultâneos não duplicam, e
      // uma contagem excluída à mão não reaparece no tick seguinte.
      const alreadyClaimed =
        schedule.type === "MENSAL"
          ? { ultimaGeracaoData: { startsWith: monthPrefix } }
          : { ultimaGeracaoData: dateKey };
      const claim = await prisma.stockCountSchedule.updateMany({
        where: {
          id: schedule.id,
          OR: [{ ultimaGeracaoData: null }, { NOT: alreadyClaimed }],
        },
        data: { ultimaGeracaoData: dateKey },
      });
      if (claim.count === 0) continue;

      const release = () =>
        prisma.stockCountSchedule.updateMany({
          where: { id: schedule.id, ultimaGeracaoData: dateKey },
          data: { ultimaGeracaoData: schedule.ultimaGeracaoData },
        });

      // Tudo depois da reivindicação fica no mesmo try: qualquer falha (banco, timeout) devolve a
      // reivindicação pra próxima execução (15 min) tentar de novo — senão a contagem do dia (ou
      // do mês, no mensal) nunca nasceria e ninguém seria avisado.
      try {
        const items = await buildStockCountItemsData(schedule.empresaId, schedule.setor);
        if (items.length === 0) {
          // Setor sem insumos ativos (ou setor removido): não cria contagem vazia — e devolve a
          // reivindicação pra tentar de novo se alguém cadastrar insumos depois, no mesmo dia.
          await release();
          continue;
        }

        const prazo = schedule.horarioLimite ? spDateTime(dateKey, schedule.horarioLimite) : null;
        await prisma.stockCount.create({
          data: {
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
            // "Iniciar contagem"/"Iniciar fechamento" agora. Aqui ninguém "iniciou" ainda; a
            // primeira conferência salva em PATCH /api/estoque/contagens/[id] é que avança pra
            // EM_ANDAMENTO. `checklistJson: null` é seguro pro fechamento mensal: a tela já
            // trata isso como "{}" ao abrir (ver `contagem-mensal-client.tsx`).
            items: { create: items },
          },
        });
      } catch (err) {
        // P2002: outra execução já criou a contagem desse (agenda, dia) — o `@@unique` segura o
        // duplicado e a reivindicação fica como está. Qualquer outro erro devolve a reivindicação.
        if ((err as { code?: string }).code === "P2002") continue;
        await release().catch(() => {});
        throw err;
      }
    } catch (err) {
      console.error(`[estoque] falha ao gerar contagem da agenda ${schedule.id}:`, err);
    }
  }
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

    // Só avisa "sua contagem está pronta" se a contagem desta agenda realmente existe e está
    // aberta (hoje, no semanal; neste mês, no mensal) — não avisa quando a geração foi pulada
    // (setor sem insumos), ainda não aconteceu, falhou, ou o mensal já foi gerado/aprovado.
    // Não marca `ultimoLembreteData` nesse caso: se ela nascer ainda dentro da janela, avisa.
    const aberta = await prisma.stockCount.findFirst({
      where: {
        scheduleId: schedule.id,
        status: { in: ["RASCUNHO", "EM_ANDAMENTO", "REABERTA"] },
        ...(schedule.type === "MENSAL"
          ? { ano: Number(dateKey.slice(0, 4)), mes: Number(dateKey.slice(5, 7)) }
          : { dataContagem: spStartOfDay(dateKey) }),
      },
      select: { id: true },
    });
    if (!aberta) continue;

    await createNotification({
      userId: schedule.responsavelId!,
      type: "ESTOQUE_CONTAGEM_LEMBRETE",
      title: "Lembrete de contagem de estoque",
      body: `Sua contagem ${COUNT_TYPE_LABEL[schedule.type] ?? schedule.type.toLowerCase()}${
        schedule.setor ? ` do setor ${schedule.setor}` : ""
      } já está pronta para conferir.`,
      priority: "INFORMACAO",
      url: "/portal/estoque/contagem",
    });
    await prisma.stockCountSchedule.update({ where: { id: schedule.id }, data: { ultimoLembreteData: dateKey } });
    notified++;
  }

  return { checked: schedules.length, notified };
}
