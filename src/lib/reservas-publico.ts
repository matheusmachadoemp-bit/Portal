import { prisma } from "@/lib/prisma";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import type { AvailabilityOption } from "@/lib/reservas-disponibilidade";

/**
 * Helpers do fluxo público de Reservas (Etapa 3, `/reservar/[empresaKey]` +
 * `src/app/api/reservar/[empresaKey]/**`) — mesmo padrão de módulo "-server"/"-publico" dedicado
 * já usado por outros fluxos sem sessão (`src/lib/customer-survey-server.ts`,
 * `src/lib/satisfaction-server.ts`): resolução da loja pelo identificador público, rate limit, e
 * a escolha de qual mesa/combinação atribuir a uma reserva (a página pública nunca deixa o
 * cliente escolher mesa específica — só ambiente, data, horário e quantidade de pessoas; qual
 * mesa/combinação exata é um detalhe operacional decidido aqui).
 */

export type PublicEmpresa = { id: string; name: string; logo: string | null; color: string; active: boolean };

/** Só os campos seguros para uma página 100% pública — nunca selecionar tokens/credenciais de
 * integração (`saiposApiToken`, `metaAdsAccessToken` etc.) aqui, mesmo racional de
 * `resolveTableByToken` (customer-survey-server.ts). */
export async function resolveEmpresaByKey(empresaKey: string): Promise<PublicEmpresa | null> {
  return prisma.empresa.findUnique({
    where: { key: empresaKey },
    select: { id: true, name: true, logo: true, color: true, active: true },
  });
}

// ---------------------------------------------------------------------------
// Rate limit — duas chaves separadas (consulta de disponibilidade vs. criação de reserva) porque
// uma única visita legítima do cliente faz VÁRIAS consultas (trocar mês, trocar ambiente/pessoas,
// abrir um dia) mas só PRECISA criar 1 reserva; limites iguais deixariam a consulta brecar cedo
// demais ou a criação frouxa demais. Chave por IP + loja (não por ambiente/dia) — mesmo racional
// de `checkCustomerSurveyRateLimit`: generoso o bastante pra uso normal, baixo o bastante pra
// travar automação.
const CONSULTA_RATE_LIMIT_MAX = 60;
const CONSULTA_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const CRIAR_RATE_LIMIT_MAX = 6;
const CRIAR_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;

export async function checkReservarConsultaRateLimit(headers: Headers, empresaKey: string): Promise<boolean> {
  const ip = getClientIp(headers);
  return checkRateLimit(`reservar-consulta:${ip}:${empresaKey}`, {
    windowMs: CONSULTA_RATE_LIMIT_WINDOW_MS,
    max: CONSULTA_RATE_LIMIT_MAX,
  });
}

export async function checkReservarCriarRateLimit(headers: Headers, empresaKey: string): Promise<boolean> {
  const ip = getClientIp(headers);
  return checkRateLimit(`reservar-criar:${ip}:${empresaKey}`, {
    windowMs: CRIAR_RATE_LIMIT_WINDOW_MS,
    max: CRIAR_RATE_LIMIT_MAX,
  });
}

// ---------------------------------------------------------------------------
// Seleção automática de mesa/combinação
// ---------------------------------------------------------------------------

/**
 * Escolhe a melhor opção dentre as alternativas que o motor de disponibilidade já filtrou como
 * compatíveis com `partySize` para aquele horário: prioriza mesa única sobre combinação (evita
 * "gastar" uma combinação de 2 mesas num grupo que cabia numa mesa só) e, dentro do mesmo tipo, a
 * de menor `capacityMax` (mesa mais "justa" para o grupo, deixando mesas maiores livres para
 * grupos maiores). `null` se não houver nenhuma opção (não deveria acontecer se o chamador já
 * conferiu `slot.available`, mas o motor pode ter ficado desatualizado entre a consulta e a
 * criação — o chamador trata isso como "horário não está mais disponível").
 */
export function pickBestOption(options: AvailabilityOption[], partySize: number): AvailabilityOption | null {
  const fitting = options.filter((o) => partySize >= o.capacityMin && partySize <= o.capacityMax);
  if (fitting.length === 0) return null;
  const sorted = [...fitting].sort((a, b) => {
    if (a.type !== b.type) return a.type === "mesa" ? -1 : 1;
    return a.capacityMax - b.capacityMax;
  });
  return sorted[0];
}
