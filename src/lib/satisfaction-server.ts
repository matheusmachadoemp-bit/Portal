import { prisma } from "@/lib/prisma";
import { randomBytes } from "crypto";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

// Ver src/lib/rate-limit.ts — ponto de partida (task #320), fácil de ajustar
// depois sem migration. Chave combina IP+token, COMPARTILHADA entre a
// página pública (src/app/pesquisa/[token]/page.tsx, que chama
// `loadInvitationByToken` direto, sem passar pela rota de API) e a rota de
// API (src/app/api/satisfaction/responder/[token]/route.ts, GET e POST) —
// mesmo IP+token não deve contar em dobro só porque a página faz uma
// consulta e a API faz outra: as duas fazem parte do mesmo fluxo de
// responder UMA pesquisa. Recebe `Headers` (não `Request`) pra funcionar
// tanto num Route Handler (`req.headers`) quanto num Server Component
// (`await headers()` de `next/headers`).
const SATISFACTION_RATE_LIMIT_MAX = 20;
const SATISFACTION_RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;

export async function checkSatisfactionRateLimit(headers: Headers, token: string): Promise<boolean> {
  const ip = getClientIp(headers);
  return checkRateLimit(`satisfaction:${ip}:${token}`, {
    windowMs: SATISFACTION_RATE_LIMIT_WINDOW_MS,
    max: SATISFACTION_RATE_LIMIT_MAX,
  });
}

export async function loadInvitationByToken(token: string) {
  return prisma.satisfactionInvitation.findUnique({
    where: { token },
    include: {
      employee: { select: { id: true, empresaId: true, setor: true, empresa: { select: { name: true, logo: true, color: true } } } },
      survey: {
        include: {
          perguntas: {
            where: { ativo: true },
            include: { opcoes: { orderBy: { ordem: "asc" } } },
            orderBy: { ordem: "asc" },
          },
        },
      },
    },
  });
}

export function invitationState(invitation: Awaited<ReturnType<typeof loadInvitationByToken>>) {
  if (!invitation) return "invalido" as const;
  if (invitation.survey.status === "CANCELADA") return "encerrada" as const;
  const now = new Date();
  if (now > invitation.survey.endDate) return "encerrada" as const;
  if (invitation.survey.permitirApenasUmaResposta && invitation.respondido) return "ja-respondido" as const;
  return "ok" as const;
}

/** Colaboradores ativos que batem com o público-alvo (loja + setor, ou loja inteira) de uma pesquisa. */
export async function resolveAudienceEmployees(surveyId: string) {
  const audiences = await prisma.satisfactionAudience.findMany({ where: { surveyId } });
  if (audiences.length === 0) return [];

  const orConditions = audiences.map((a) => (a.setor ? { empresaId: a.empresaId, setor: a.setor } : { empresaId: a.empresaId }));

  return prisma.employee.findMany({
    where: { status: "ATIVO", OR: orConditions },
    select: { id: true, name: true, empresaId: true, setor: true },
  });
}

/**
 * Gera convites (idempotente) para todo colaborador do público-alvo que ainda
 * não tenha um convite para essa pesquisa.
 */
export async function generateInvitations(surveyId: string) {
  const employees = await resolveAudienceEmployees(surveyId);
  if (employees.length === 0) return { created: 0 };

  const existing = await prisma.satisfactionInvitation.findMany({ where: { surveyId }, select: { employeeId: true } });
  const alreadyInvited = new Set(existing.map((e) => e.employeeId));
  const toInvite = employees.filter((e) => !alreadyInvited.has(e.id));
  if (toInvite.length === 0) return { created: 0 };

  await prisma.satisfactionInvitation.createMany({
    data: toInvite.map((e) => ({ surveyId, employeeId: e.id, token: randomBytes(20).toString("hex") })),
  });
  return { created: toInvite.length };
}
