import { prisma } from "@/lib/prisma";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

/**
 * Helpers do fluxo público de Reservas (Etapa 3, `/reservar/[empresaKey]` +
 * `src/app/api/reservar/[empresaKey]/**`) — mesmo padrão de módulo "-server"/"-publico" dedicado
 * já usado por outros fluxos sem sessão (`src/lib/customer-survey-server.ts`,
 * `src/lib/satisfaction-server.ts`): resolução da loja pelo identificador público e rate limit.
 *
 * Até a tarefa "reservas-remover-mesas", este arquivo também escolhia qual mesa/combinação
 * atribuir a uma reserva (`pickBestOption`) — removido junto com o resto do rastreamento de mesa
 * (ver comentário de redesign em `src/lib/reservas-disponibilidade.ts`): a disponibilidade agora é
 * só capacidade agregada do ambiente, sem nenhuma mesa pra escolher.
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
