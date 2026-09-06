import { prisma } from "@/lib/prisma";
import { subDays, startOfDay, endOfDay } from "date-fns";
import { findLinkedEmployee, findMetasDoUsuario } from "@/lib/inicio";
import { refreshOccurrenceStatuses } from "@/lib/checklist-server";
import type { ChecklistOccurrenceStatus } from "@prisma/client";

// ---------------------------------------------------------------------------
// CONQUISTAS (BADGES) — critérios de concessão dos badges gerais (model
// `Badge`/`UserBadge`, ver prisma/schema.prisma), verificados sob demanda
// (nenhum cron job) toda vez que GET /api/inicio/conquistas é chamado.
//
// Do pedido original ("Sete dias sem atraso", "Checklist perfeito", "Curso
// concluído", "Atendimento destaque", "Meta alcançada"):
// - "Curso concluído" não é implementado aqui — já existe via
//   `TrainingBadge`/`TrainingUserBadge` (módulo de Universidade/Cursos).
//   Só aparece unificado na resposta de `listarConquistas`, abaixo.
// - "Atendimento destaque" foi PULADO de propósito: não existe no schema
//   nenhum dado que avalie o atendimento de um colaborador ESPECÍFICO.
//   `SalaoMeeting.npsAtendimento` é um NPS por categoria da LOJA INTEIRA,
//   agregado por mês (não por pessoa). `SatisfactionResponse` (pesquisa de
//   satisfação) é explicitamente anônima e sem nenhuma coluna que aponte
//   para convite/colaborador/usuário. `NpsResponse.responsavelId` é quem
//   ficou responsável por RESOLVER uma avaliação (normalmente um
//   gerente), não quem atendeu o cliente na venda — e `NpsResponse.saleId`
//   nem é uma relação real com `Sale` no schema (é só um texto solto), então
//   também não daria pra cruzar com `Sale.garcomId` de forma confiável. Sem
//   inventar uma regra nova, este badge fica de fora até existir uma
//   avaliação de atendimento por colaborador de verdade.
// ---------------------------------------------------------------------------

const BADGE_KEYS = ["sete_dias_sem_atraso", "checklist_perfeito", "meta_alcancada"] as const;
type BadgeKey = (typeof BADGE_KEYS)[number];

/** Janela usada por "Sete dias sem atraso" — 7 dias corridos incluindo hoje. */
const SETE_DIAS_JANELA = 7;

/** Janela usada por "Checklist perfeito" — últimos 30 dias corridos incluindo hoje. */
const CHECKLIST_PERFEITO_JANELA_DIAS = 30;
/**
 * Mínimo de ocorrências de checklist no período para o critério valer algo —
 * sem isso, alguém com só 1 ou 2 checklists atribuídos por acaso (ex.: só
 * virou responsável ontem) ganharia "perfeito" com quase nenhum histórico.
 * Limiar escolhido: pelo menos 5 ocorrências nos últimos 30 dias (média de
 * pouco mais de 1 por semana).
 */
const CHECKLIST_PERFEITO_MINIMO_OCORRENCIAS = 5;

/** Status de `ChecklistOccurrence` que invalidam o "perfeito": concluído com atraso, ainda aberto e vencido, ou nunca realizado. */
const CHECKLIST_STATUS_FALHA: ChecklistOccurrenceStatus[] = ["CONCLUIDO_COM_ATRASO", "ATRASADO", "NAO_REALIZADO"];

/**
 * "Sete dias sem atraso" — nenhuma `Occurrence` do tipo ATRASO do
 * colaborador ligado a este usuário (`findLinkedEmployee`, de
 * src/lib/inicio.ts) nos últimos 7 dias corridos. Quando o usuário não tem
 * ficha de RH ligada nesta empresa, o critério não é avaliável — retorna
 * `false` (não concede), sem lançar erro.
 *
 * Exige também que o colaborador já tenha sido admitido há pelo menos 7
 * dias: sem essa checagem, alguém contratado hoje ganharia o badge "de
 * graça" (não teve nem chance de se atrasar ainda).
 */
async function checkSeteDiasSemAtraso(empresaId: string, userId: string, now: Date): Promise<boolean> {
  const employee = await findLinkedEmployee(empresaId, userId);
  if (!employee) return false;

  const desde = startOfDay(subDays(now, SETE_DIAS_JANELA - 1));

  const admitidoHaTempoSuficiente = await prisma.employee.findFirst({
    where: { id: employee.id, admissionDate: { lte: desde } },
    select: { id: true },
  });
  if (!admitidoHaTempoSuficiente) return false;

  const atrasos = await prisma.occurrence.count({
    where: { employeeId: employee.id, type: "ATRASO", date: { gte: desde, lte: endOfDay(now) } },
  });
  return atrasos === 0;
}

/**
 * "Checklist perfeito" — nos últimos 30 dias corridos, o colaborador teve
 * pelo menos `CHECKLIST_PERFEITO_MINIMO_OCORRENCIAS` ocorrências de
 * checklist sob sua responsabilidade (responsável direto OU substituto do
 * template, mesmo critério de "meu checklist" de `loadRotinaChecklist`) e
 * NENHUMA delas ficou com status de falha (`CHECKLIST_STATUS_FALHA`).
 * Recalcula o status "ao vivo" antes de avaliar (`refreshOccurrenceStatuses`,
 * de src/lib/checklist-server.ts), mesmo recurso já usado por
 * `loadRotinaChecklist`/`loadAlertaChecklistAtrasado` — evita avaliar contra
 * um status desatualizado (ex.: uma ocorrência de ontem ainda gravada como
 * "DISPONIVEL" só porque ninguém abriu a tela dela ainda).
 */
async function checkChecklistPerfeito(empresaId: string, userId: string, now: Date): Promise<boolean> {
  const desde = startOfDay(subDays(now, CHECKLIST_PERFEITO_JANELA_DIAS - 1));

  const ocorrencias = await prisma.checklistOccurrence.findMany({
    where: {
      empresaId,
      date: { gte: desde, lte: endOfDay(now) },
      OR: [{ responsavelId: userId }, { template: { substitutoId: userId } }],
    },
    select: { id: true },
  });
  if (ocorrencias.length < CHECKLIST_PERFEITO_MINIMO_OCORRENCIAS) return false;

  const ids = ocorrencias.map((o) => o.id);
  await refreshOccurrenceStatuses(ids);

  const atualizadas = await prisma.checklistOccurrence.findMany({
    where: { id: { in: ids } },
    select: { status: true },
  });
  return atualizadas.every((o) => !CHECKLIST_STATUS_FALHA.includes(o.status));
}

/**
 * "Meta alcançada" — reaproveita `findMetasDoUsuario` (src/lib/inicio.ts,
 * mesma busca usada por "rotina" e por "minha meta") e concede o badge se
 * alguma das metas encontradas já estiver com `status === "CONCLUIDA"`
 * (enum `GoalStatus` — é o único valor que representa meta atingida;
 * `EM_RISCO` é "perto de bater", `NAO_ATINGIDA` é prazo vencido sem bater).
 *
 * Importante: `findMetasDoUsuario` só devolve metas do período corrente
 * (iniciadas, ainda não encerradas há mais de alguns dias — ver
 * `DIAS_LIMITE_URGENTE` em src/lib/inicio.ts), não um histórico completo.
 * Isso significa que uma meta batida há muito tempo, fora dessa janela, não
 * é encontrada por esta checagem. Na prática isso é aceitável: como a
 * concessão roda sempre que o colaborador abre a Tela de Início, qualquer
 * meta seguinte que ele bater enquanto ainda "corrente" já concede o badge
 * (que persiste para sempre depois disso, por ser @@unique por usuário).
 */
async function checkMetaAlcancada(empresaId: string, userId: string, nomeUsuario: string, now: Date): Promise<boolean> {
  const metas = await findMetasDoUsuario(empresaId, userId, nomeUsuario, now);
  return metas.some((m) => m.status === "CONCLUIDA");
}

const CRITERIOS: Record<BadgeKey, (empresaId: string, userId: string, nomeUsuario: string, now: Date) => Promise<boolean>> = {
  sete_dias_sem_atraso: (empresaId, userId, _nomeUsuario, now) => checkSeteDiasSemAtraso(empresaId, userId, now),
  checklist_perfeito: (empresaId, userId, _nomeUsuario, now) => checkChecklistPerfeito(empresaId, userId, now),
  meta_alcancada: (empresaId, userId, nomeUsuario, now) => checkMetaAlcancada(empresaId, userId, nomeUsuario, now),
};

/**
 * Verifica-e-concede (idempotente): para cada badge geral que o usuário
 * ainda não tem, roda o critério correspondente e grava a conquista
 * (`earnedAt = now`) se atingido. Nunca roda o critério de um badge já
 * conquistado (não é preciso — `@@unique([userId, badgeId])` já impediria
 * duplicar, mas assim evitamos consultas à toa). Sem cron job: chamada sob
 * demanda por GET /api/inicio/conquistas.
 *
 * Se um badge da lista não estiver cadastrado em `Badge` (seed não rodou
 * ainda neste ambiente), o critério correspondente é ignorado em silêncio —
 * a rota nunca falha por causa disso.
 */
export async function verificarEConcederBadges(
  empresaId: string,
  userId: string,
  nomeUsuario: string,
  now: Date = new Date()
): Promise<void> {
  const jaConquistados = await prisma.userBadge.findMany({
    where: { userId, badge: { key: { in: BADGE_KEYS as unknown as string[] } } },
    select: { badge: { select: { key: true } } },
  });
  const jaConquistadosKeys = new Set(jaConquistados.map((c) => c.badge.key));

  const faltantes = BADGE_KEYS.filter((key) => !jaConquistadosKeys.has(key));
  if (faltantes.length === 0) return;

  for (const key of faltantes) {
    const atingiu = await CRITERIOS[key](empresaId, userId, nomeUsuario, now);
    if (!atingiu) continue;

    const badge = await prisma.badge.findUnique({ where: { key } });
    if (!badge) continue;

    await prisma.userBadge.upsert({
      where: { userId_badgeId: { userId, badgeId: badge.id } },
      update: {},
      create: { userId, badgeId: badge.id, earnedAt: now },
    });
  }
}

export type ConquistaResumo = {
  key: string;
  nome: string;
  descricao: string;
  icone: string;
  cor: string;
  conquistadaEm: string;
  origem: "geral" | "curso";
};

/**
 * Todas as conquistas do usuário, já unificadas num só formato: as gerais
 * (`UserBadge`, badges deste módulo) e as de treinamento (`TrainingUserBadge`
 * — módulo de Universidade/Cursos, que já concede seus próprios badges
 * independentemente desta tela). Mais recentes primeiro.
 */
export async function listarConquistas(userId: string): Promise<ConquistaResumo[]> {
  const [gerais, curso] = await Promise.all([
    prisma.userBadge.findMany({ where: { userId }, include: { badge: true } }),
    prisma.trainingUserBadge.findMany({ where: { userId }, include: { badge: true } }),
  ]);

  const conquistas: ConquistaResumo[] = [
    ...gerais.map(
      (c): ConquistaResumo => ({
        key: c.badge.key,
        nome: c.badge.name,
        descricao: c.badge.description ?? "",
        icone: c.badge.icon,
        cor: c.badge.color,
        conquistadaEm: c.earnedAt.toISOString(),
        origem: "geral",
      })
    ),
    ...curso.map(
      (c): ConquistaResumo => ({
        key: c.badge.key,
        nome: c.badge.name,
        descricao: c.badge.description ?? "",
        icone: c.badge.icon,
        cor: c.badge.color,
        conquistadaEm: c.earnedAt.toISOString(),
        origem: "curso",
      })
    ),
  ];

  return conquistas.sort((a, b) => new Date(b.conquistadaEm).getTime() - new Date(a.conquistadaEm).getTime());
}
