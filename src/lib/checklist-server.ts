import { prisma } from "@/lib/prisma";
import { Prisma, type ChecklistEscalationType } from "@prisma/client";
import {
  CHECKLIST_ESCALATION_PRIORITY,
  computeOccurrenceStatus,
  dueEscalationLevels,
  spDateKey,
  spDateTime,
  spStartOfDay,
  weekdayFieldFor,
} from "@/lib/checklist";
import { createNotification } from "@/lib/notifications";

/**
 * Gera (de forma idempotente, via @@unique([templateId, date])) as
 * ocorrências do dia `dateKey` para os templates ativos das empresas
 * informadas — só nos dias da semana marcados no template.
 */
export async function generateChecklistOccurrences(empresaIds: string[], dateKey: string = spDateKey()) {
  if (empresaIds.length === 0) return;

  const day = spStartOfDay(dateKey);
  const weekdayField = weekdayFieldFor(dateKey);

  // Só os campos usados para montar a ocorrência — o restante do template
  // (descrição, regras de cobrança, etc.) não é lido aqui.
  const templates = await prisma.checklistTemplate.findMany({
    where: {
      empresaId: { in: empresaIds },
      active: true,
      startDate: { lte: day },
      OR: [{ endDate: null }, { endDate: { gte: day } }],
      [weekdayField]: true,
    },
    select: { id: true, empresaId: true, releaseTime: true, dueTime: true, responsavelId: true },
  });

  await Promise.all(
    templates.map((t) => {
      const releaseAt = spDateTime(dateKey, t.releaseTime);
      const dueAt = spDateTime(dateKey, t.dueTime);
      return prisma.checklistOccurrence.upsert({
        where: { templateId_date: { templateId: t.id, date: day } },
        update: {},
        create: {
          templateId: t.id,
          empresaId: t.empresaId,
          date: day,
          releaseAt,
          dueAt,
          responsavelId: t.responsavelId,
        },
      });
    })
  );
}

/** Recalcula (e persiste, se mudou) o status "ao vivo" de cada ocorrência. */
export async function refreshOccurrenceStatuses(occurrenceIds: string[]) {
  if (occurrenceIds.length === 0) return;
  // Só os campos usados pelo cálculo de status — não a ocorrência inteira
  // (que carregaria justificativa/campos de comprovação sem necessidade).
  const occurrences = await prisma.checklistOccurrence.findMany({
    where: { id: { in: occurrenceIds } },
    select: { id: true, releaseAt: true, dueAt: true, startedAt: true, completedAt: true, status: true },
  });
  const now = new Date();
  await Promise.all(
    occurrences.map((o) => {
      const next = computeOccurrenceStatus({
        releaseAt: o.releaseAt,
        dueAt: o.dueAt,
        startedAt: o.startedAt,
        completedAt: o.completedAt,
        currentStatus: o.status,
        now,
      });
      if (next === o.status) return null;
      return prisma.checklistOccurrence.update({ where: { id: o.id }, data: { status: next } });
    })
  );
}

// ---------------------------------------------------------------------------
// Ocorrências do dia, prontas para consumo (Fase 1b/2 — Tela de Início) —
// junta os 3 passos que `loadRotinaChecklist` e `loadAlertaChecklistAtrasado`
// (src/lib/inicio.ts) faziam cada um por conta própria: gerar as ocorrências
// do dia, buscá-las (com o template completo) e atualizar o status "ao
// vivo" de cada uma. As duas rotas que usam essas funções
// (/api/inicio/rotina e /api/inicio/alertas) são chamadas em paralelo pelo
// navegador na Tela de Início — como as duas pedem exatamente os mesmos 3
// passos para a mesma loja+dia, `occurrencesDoDiaInFlight` coalesce
// chamadas concorrentes (mesma chave `empresaId:dateKey`) numa única
// execução, em vez de repetir a geração/busca/atualização duas vezes.
//
// Não é um cache com TTL (não guarda nada depois de resolver): a entrada
// só existe enquanto a promise está em voo e é removida assim que ela
// termina (sucesso ou erro), então uma chamada que chega depois que a
// anterior já terminou sempre dispara uma busca nova — sem janela de dado
// desatualizado. Só reduz trabalho quando as chamadas realmente se
// sobrepõem no tempo, que é exatamente o caso descrito acima.
// ---------------------------------------------------------------------------

const occurrencesDoDiaInFlight = new Map<string, ReturnType<typeof fetchAndRefreshOccurrencesDoDia>>();

async function fetchAndRefreshOccurrencesDoDia(empresaId: string, dateKey: string) {
  await generateChecklistOccurrences([empresaId], dateKey);

  const day = spStartOfDay(dateKey);
  const occurrences = await prisma.checklistOccurrence.findMany({
    where: { empresaId, date: day },
    include: { template: true },
  });
  if (occurrences.length > 0) {
    await refreshOccurrenceStatuses(occurrences.map((o) => o.id));
  }
  return occurrences;
}

/**
 * Gera (se necessário) e devolve TODAS as ocorrências de checklist do dia
 * `dateKey` de uma loja, com o template completo incluído e o status já
 * atualizado no banco (`refreshOccurrenceStatuses`). O `status` de cada
 * ocorrência no retorno é o valor de ANTES do refresh — igual ao que
 * `loadRotinaChecklist`/`loadAlertaChecklistAtrasado` já faziam: cada
 * chamador recalcula o status "ao vivo" localmente com
 * `computeOccurrenceStatus` (mesma fórmula pura usada pelo refresh, com o
 * mesmo `releaseAt`/`dueAt`/`startedAt`/`completedAt`/`status`), então não
 * precisa reler do banco depois de persistir.
 */
export async function loadChecklistOccurrencesDoDia(empresaId: string, dateKey: string) {
  const key = `${empresaId}:${dateKey}`;
  const inFlight = occurrencesDoDiaInFlight.get(key);
  if (inFlight) return inFlight;

  const promise = fetchAndRefreshOccurrencesDoDia(empresaId, dateKey);
  occurrencesDoDiaInFlight.set(key, promise);
  try {
    return await promise;
  } finally {
    occurrencesDoDiaInFlight.delete(key);
  }
}

const GOAL_CATEGORY_LABEL: Record<string, string> = {
  GERENCIA: "Gerência",
  SALAO: "Salão",
  COZINHA: "Cozinha",
  DELIVERY: "Delivery",
  MARKETING: "Marketing",
  ADMINISTRATIVO: "Administrativo",
};

/** Gerentes da loja (role GERENTE com acesso à loja) + proprietários/administradores (veem todas as lojas). */
async function loadEscalationManagers(empresaId: string) {
  return prisma.user.findMany({
    where: {
      active: true,
      OR: [
        { role: { in: ["ADMINISTRADOR", "GESTOR"] } },
        { role: "GERENTE", empresaAccess: { some: { empresaId } } },
      ],
    },
    select: { id: true },
  });
}

function escalationMessage(
  tipo: ChecklistEscalationType,
  ctx: { name: string; empresaName: string; setor: string; minutesLate: number; responsavelName: string | null }
) {
  const setorLabel = GOAL_CATEGORY_LABEL[ctx.setor] ?? ctx.setor;
  const local = `${ctx.empresaName}, ${setorLabel}`;
  const responsavel = ctx.responsavelName ? ` Responsável: ${ctx.responsavelName}.` : "";
  switch (tipo) {
    case "AVISO_ANTES":
      return { title: "Checklist perto do prazo", body: `"${ctx.name}" está perto do horário limite — ${local}.` };
    case "NO_LIMITE":
      return { title: "Checklist no horário limite", body: `"${ctx.name}" chegou ao horário limite — ${local}.` };
    case "ATRASO_RESPONSAVEL":
      return {
        title: "Checklist atrasado",
        body: `"${ctx.name}" está ${Math.max(0, Math.round(ctx.minutesLate))} min atrasado — ${local}.${responsavel}`,
      };
    case "ALERTA_CRITICO":
      return {
        title: "Atraso crítico em checklist",
        body: `"${ctx.name}" está ${Math.max(0, Math.round(ctx.minutesLate))} min atrasado (crítico) — ${local}.${responsavel}`,
      };
    case "NAO_REALIZADO":
      return {
        title: "Checklist não realizado",
        body: `"${ctx.name}" não foi concluído dentro do prazo e foi marcado como não realizado — ${local}.${responsavel}`,
      };
  }
}

/**
 * Notifica donos/gerentes toda vez que um funcionário conclui um checklist
 * — no prazo ou atrasado. A conclusão atrasada é a parte que mais importa:
 * `processChecklistEscalations` roda a cada poucos minutos (GitHub Actions,
 * ver .github/workflows/checklist-escalations.yml, mais o cron diário do
 * Vercel como reforço — ver vercel.json) mas só reavalia ocorrências ainda
 * em aberto: uma vez com `completedAt` preenchido, `dueEscalationLevels`
 * não gera mais nenhum nível de cobrança pra ela (não recalcula níveis pra
 * quem já concluiu). Então um checklist concluído poucos minutos atrasado
 * — antes de cruzar o limiar de `avisoAtrasoResponsavelMinutos`/
 * `alertaCriticoMinutos` — nunca gerava nenhum aviso por conta própria.
 * Esta função fecha essa lacuna e também avisa nas conclusões no prazo,
 * disparando na hora, direto do endpoint de conclusão.
 */
export async function notifyChecklistCompletion(occurrenceId: string) {
  const o = await prisma.checklistOccurrence.findUnique({
    where: { id: occurrenceId },
    include: { template: true, empresa: { select: { name: true } }, responsavel: { select: { name: true } } },
  });
  if (!o || !o.completedAt) return;

  const managers = await loadEscalationManagers(o.empresaId);
  if (managers.length === 0) return;

  const setorLabel = GOAL_CATEGORY_LABEL[o.template.setor] ?? o.template.setor;
  const responsavel = o.responsavel?.name ? ` Responsável: ${o.responsavel.name}.` : "";
  const isLate = o.status === "CONCLUIDO_COM_ATRASO";

  const title = isLate ? "Checklist concluído com atraso" : "Checklist concluído";
  const body = isLate
    ? `"${o.template.name}" foi concluído ${Math.max(
        0,
        Math.round((o.completedAt.getTime() - o.dueAt.getTime()) / 60000)
      )} min atrasado — ${o.empresa.name}, ${setorLabel}.${responsavel}`
    : `"${o.template.name}" foi concluído no prazo — ${o.empresa.name}, ${setorLabel}.${responsavel}`;

  await Promise.all(
    managers.map((m) =>
      createNotification({
        userId: m.id,
        type: isLate ? "CHECKLIST_CONCLUIDO_COM_ATRASO" : "CHECKLIST_CONCLUIDO",
        title,
        body,
        priority: isLate ? "ATENCAO" : "INFORMACAO",
        checklistOccurrenceId: o.id,
        url: `/portal/tarefas/checklist/executar/${o.id}`,
      })
    )
  );
}

/**
 * Destinatários de um nível de escalonamento específico — AVISO_ANTES/NO_LIMITE só avisam o
 * responsável (ainda não é "problema dos gestores"); ATRASO_RESPONSAVEL/ALERTA_CRITICO avisam
 * responsável + gestores da loja; NAO_REALIZADO avisa só os gestores (a ocorrência já está
 * encerrada nesse ponto). Extraída da função principal porque agora é usada pra decidir, por
 * destinatário, QUAIS níveis vencidos se aplicam a ele antes de escolher qual deles efetivamente
 * notificar (ver `processChecklistEscalations`).
 */
function recipientsForLevel(
  tipo: ChecklistEscalationType,
  responsavelId: string | null,
  managerIds: Set<string>
): string[] {
  if (tipo === "AVISO_ANTES" || tipo === "NO_LIMITE") {
    return responsavelId ? [responsavelId] : [];
  }
  if (tipo === "ATRASO_RESPONSAVEL" || tipo === "ALERTA_CRITICO") {
    return [...new Set([...(responsavelId ? [responsavelId] : []), ...managerIds])];
  }
  return [...managerIds];
}

/**
 * Processa cobrança automática das ocorrências informadas: para cada nível de escalonamento já
 * vencido (calculado a partir dos horários e das configurações do template), notifica os
 * destinatários certos — uma única vez por ocorrência+nível+destinatário, graças à chave única de
 * `ChecklistEscalationLog`. Ao atingir o nível NAO_REALIZADO, também marca a ocorrência como não
 * realizada.
 *
 * Duas garantias importantes, as duas corrigindo problemas reais encontrados ao vivo (sessão de
 * investigação do pedido "Configurações > Notificações de checklist" — relato do Matheus: "chega
 * muita notificação... tipo 'não foi feito há 336 minutos'"):
 *
 * 1. Rajada de níveis quando o cron atrasa (causa raiz B): este motor depende de um disparo
 *    externo rodando a cada poucos minutos (ver .github/workflows/checklist-escalations.yml),
 *    mas esse disparo pode ficar horas sem rodar de verdade na prática (limitação do agendador do
 *    GitHub Actions pra schedules muito frequentes — confirmado ao vivo consultando o histórico
 *    real de execuções via API do GitHub: mediana de ~4h entre execuções, não os 5 min
 *    configurados; corrigir isso é uma decisão de infra fora do código, acompanhada separadamente
 *    com o Matheus). Quando isso acontece, uma ocorrência atrasada pode ter VÁRIOS níveis vencidos
 *    de uma vez (ex.: ATRASO_RESPONSAVEL + ALERTA_CRITICO + NAO_REALIZADO todos vencidos juntos) —
 *    antes, cada nível gerava sua própria notificação, e um responsável/gestor recebia uma rajada
 *    de vários avisos de uma vez, todos carimbados com o mesmo atraso acumulado. Agora: por
 *    DESTINATÁRIO, só o nível mais severo entre os vencidos-e-ainda-não-notificados gera
 *    notificação de verdade; os níveis mais brandos vencidos na mesma rodada ainda ganham um
 *    registro de controle (pra nunca serem "recuperados" e notificados tardiamente numa rodada
 *    futura, o que pareceria um aviso andando pra trás no tempo), só não disparam notificação
 *    própria.
 *
 * 2. Corrida entre execuções concorrentes (causa raiz C, com uma volta extra achada na revisão
 *    do Teulis): como existe mais de um gatilho pro mesmo endpoint (GitHub Actions + cron diário
 *    do Vercel, ver vercel.json, mais qualquer disparo manual), duas execuções podem processar a
 *    MESMA ocorrência ao mesmo tempo. Primeira versão: a função antiga criava a Notification e SÓ
 *    DEPOIS tentava gravar o `ChecklistEscalationLog` — as duas checagens de "já notifiquei?"
 *    aconteciam antes de qualquer uma escrever, então as duas podiam achar que não e as duas
 *    mandarem a notificação (duplicada), com só uma conseguindo gravar o log (a outra quebrava com
 *    erro P2002 não tratado). Corrigido invertendo a ordem (gravar o log primeiro, só notificar se
 *    a gravação coube a esta execução) — mas essa correção ainda reivindicava o nível MAIS SEVERO
 *    primeiro e só gravava os níveis "absorvidos" (ponto 1 acima) DEPOIS de chamar
 *    `createNotification` (que inclui envio de push, rede, pode demorar). Isso deixava uma janela
 *    real: uma execução concorrente lendo `existingLogs` nesse meio-tempo via o nível mais severo
 *    já reivindicado mas os absorvidos ainda "livres" — concluía (do SEU snapshot, correto mas
 *    incompleto) que um nível mais brando era "o mais severo pendente" PRA ELA, reivindicava esse
 *    nível separadamente (sem colidir com nenhuma chave única, já que é um `tipo` diferente) e
 *    mandava uma SEGUNDA notificação pro mesmo destinatário na mesma rodada. Reproduzido ao vivo
 *    pelo Teulis (4 de 8 rodadas concorrentes duplicando pelo menos um destinatário).
 *
 *    Correção final: reivindica TODOS os níveis pendentes de um destinatário (o mais severo + os
 *    absorvidos) numa ÚNICA chamada `createMany` SEM `skipDuplicates` — um INSERT multi-linha é um
 *    único statement no Postgres, então se qualquer uma das linhas colidir com a chave única
 *    (outra execução concorrente já reivindicou QUALQUER um desses níveis pra este destinatário
 *    nesta janela), o statement inteiro falha e NENHUMA linha é gravada (nunca reivindica só uma
 *    parte). Então: ou este destinatário reivindica tudo de uma vez e manda uma única notificação
 *    (a do nível mais severo), ou não reivindica nada e não notifica nesta rodada (a execução
 *    concorrente que venceu já cobre esse destinatário). Mesmo padrão de detecção de P2002 já
 *    usado em src/lib/prisma-errors.ts e src/lib/roulette-server.ts. Isso nunca impede
 *    escalonamento de verdade em RODADAS SEPARADAS no tempo (ex.: ATRASO_RESPONSAVEL de manhã,
 *    ALERTA_CRITICO à tarde se ainda não resolvido) — só fecha a janela DENTRO da mesma avaliação
 *    concorrente.
 */
export async function processChecklistEscalations(occurrenceIds: string[]) {
  if (occurrenceIds.length === 0) return { notified: 0 };

  const occurrences = await prisma.checklistOccurrence.findMany({
    where: { id: { in: occurrenceIds } },
    include: { template: true, empresa: { select: { name: true } }, responsavel: { select: { id: true, name: true } } },
  });

  const now = new Date();
  let notified = 0;

  // Uma busca por loja distinta (não por ocorrência) — várias ocorrências costumam ser da mesma loja.
  const distinctEmpresaIds = [...new Set(occurrences.map((o) => o.empresaId))];
  const managersByEmpresa = new Map(
    await Promise.all(
      distinctEmpresaIds.map(async (empresaId) => [empresaId, await loadEscalationManagers(empresaId)] as const)
    )
  );

  for (const o of occurrences) {
    if (!o.template.cobrancaAtiva) continue;

    const levels = dueEscalationLevels({
      dueAt: o.dueAt,
      completedAt: o.completedAt,
      currentStatus: o.status,
      avisoAntesMinutos: o.template.avisoAntesMinutos,
      avisoAtrasoResponsavelMinutos: o.template.avisoAtrasoResponsavelMinutos,
      alertaCriticoMinutos: o.template.alertaCriticoMinutos,
      naoRealizadoMinutos: o.template.naoRealizadoMinutos,
      now,
    });
    if (levels.length === 0) continue;

    const minutesLate = (now.getTime() - o.dueAt.getTime()) / 60000;
    const managerIds = new Set((managersByEmpresa.get(o.empresaId) ?? []).map((m) => m.id));

    // `levels` já vem em ordem crescente de severidade (ver dueEscalationLevels em
    // src/lib/checklist.ts) — agrupar por destinatário preserva essa ordem, então o último item
    // de cada lista é sempre o nível mais severo que venceu para aquele destinatário nesta rodada.
    const levelsByRecipient = new Map<string, ChecklistEscalationType[]>();
    for (const tipo of levels) {
      for (const destinatarioId of recipientsForLevel(tipo, o.responsavelId, managerIds)) {
        const arr = levelsByRecipient.get(destinatarioId) ?? [];
        arr.push(tipo);
        levelsByRecipient.set(destinatarioId, arr);
      }
    }
    const candidateIds = [...levelsByRecipient.keys()];
    if (candidateIds.length === 0) continue;

    // Todos os logs já existentes pra esta ocorrência, pros destinatários candidatos desta
    // rodada — uma única busca, reaproveitada por destinatário/nível abaixo.
    const existingLogs = await prisma.checklistEscalationLog.findMany({
      where: { occurrenceId: o.id, destinatarioId: { in: candidateIds } },
      select: { tipo: true, destinatarioId: true },
    });
    const already = new Set(existingLogs.map((l) => `${l.tipo}:${l.destinatarioId}`));

    // Cada destinatário é independente dos demais — dá pra processar em paralelo.
    const sent = await Promise.all(
      candidateIds.map(async (destinatarioId) => {
        const pendingLevels = (levelsByRecipient.get(destinatarioId) ?? []).filter(
          (tipo) => !already.has(`${tipo}:${destinatarioId}`)
        );
        if (pendingLevels.length === 0) return 0;

        const mostSevere = pendingLevels[pendingLevels.length - 1];

        // Reivindica TODOS os níveis pendentes (o mais severo + os "absorvidos") numa ÚNICA
        // operação, nunca um de cada vez. Achado real do Teulis na revisão: a versão anterior
        // reivindicava só o nível mais severo primeiro (o "cadeado") e só gravava os absorvidos
        // DEPOIS de chamar `createNotification` (que inclui envio de push, rede, pode demorar) —
        // isso deixava uma janela real em que uma execução concorrente, lendo `existingLogs`
        // nesse meio-tempo, via o nível mais severo já reivindicado mas os absorvidos ainda
        // "livres", e concluía (corretamente, a partir do SEU snapshot incompleto) que um nível
        // mais brando era "o mais severo pendente" pra ela — reivindicava esse nível
        // separadamente (sem colidir com nenhuma chave única, já que é um `tipo` diferente) e
        // mandava uma SEGUNDA notificação pro mesmo destinatário na mesma rodada, às vezes com o
        // nível mais brando chegando depois do mais severo. Reproduzido ao vivo pelo Teulis (4 de
        // 8 rodadas concorrentes duplicando pelo menos um destinatário).
        //
        // A correção: um único `createMany` SEM `skipDuplicates` é atômico no Postgres (um INSERT
        // multi-linha é um único statement — se qualquer linha colidir com a chave única, o
        // statement inteiro falha e NENHUMA linha é gravada, nunca reivindica só uma parte).
        // Então, ou este destinatário reivindica TODOS os níveis pendentes desta rodada de uma vez
        // (e aí sim manda uma única notificação, pro mais severo), ou — se QUALQUER um deles já
        // tiver sido reivindicado por uma execução concorrente nesse meio-tempo — não reivindica
        // nenhum e não manda notificação nenhuma nesta rodada (a execução concorrente que venceu
        // cobre o destinatário sozinha). Isso nunca impede escalonamento de verdade em RODADAS
        // SEPARADAS no tempo (ex.: ATRASO_RESPONSAVEL de manhã, ALERTA_CRITICO à tarde se ainda não
        // resolvido) — só fecha a janela DENTRO da mesma avaliação concorrente.
        try {
          await prisma.checklistEscalationLog.createMany({
            data: pendingLevels.map((tipo) => ({ occurrenceId: o.id, tipo, destinatarioId })),
          });
        } catch (err) {
          if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return 0;
          throw err;
        }

        const { title, body } = escalationMessage(mostSevere, {
          name: o.template.name,
          empresaName: o.empresa.name,
          setor: o.template.setor,
          minutesLate,
          responsavelName: o.responsavel?.name ?? null,
        });
        const notification = await createNotification({
          userId: destinatarioId,
          type: `CHECKLIST_${mostSevere}`,
          title,
          body,
          priority: CHECKLIST_ESCALATION_PRIORITY[mostSevere],
          checklistOccurrenceId: o.id,
          url: `/portal/tarefas/checklist/executar/${o.id}`,
        });
        await prisma.checklistEscalationLog.update({
          where: { occurrenceId_tipo_destinatarioId: { occurrenceId: o.id, tipo: mostSevere, destinatarioId } },
          data: { notificationId: notification.id },
        });

        return 1;
      })
    );
    notified += sent.reduce<number>((sum, n) => sum + n, 0);

    if (levels.includes("NAO_REALIZADO") && o.status !== "NAO_REALIZADO") {
      await prisma.checklistOccurrence.update({ where: { id: o.id }, data: { status: "NAO_REALIZADO" } });
    }
  }

  return { notified };
}
