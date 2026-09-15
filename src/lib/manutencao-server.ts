import { prisma } from "@/lib/prisma";
import type { Prisma, ChamadoCategoria, ChamadoPrioridade, ChamadoStatus } from "@prisma/client";
import { createNotification } from "@/lib/notifications";

export const MANAGER_ROLES = ["ADMINISTRADOR", "GESTOR", "GERENTE", "SUPERVISOR"];

// Anexos de manutenção sempre passam antes pelo /api/upload (Vercel Blob),
// que já valida tipo/tamanho de verdade. Como não dá pra "re-validar" um
// arquivo já hospedado externamente, a defesa possível aqui é garantir que a
// URL recebida do cliente realmente aponta pro domínio de armazenamento do
// Blob, e não uma URL arbitrária de fora do sistema.
const BLOB_HOSTNAME_SUFFIX = ".public.blob.vercel-storage.com";

export function isValidBlobUrl(url: unknown): url is string {
  if (typeof url !== "string" || !url) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && parsed.hostname.endsWith(BLOB_HOSTNAME_SUFFIX);
  } catch {
    return false;
  }
}

function stripAccents(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function slugPrefix(text: string, length: number): string {
  const cleaned = stripAccents(text)
    .toUpperCase()
    .replace(/[^A-Z]/g, "");
  return (cleaned || "XXX").slice(0, length).padEnd(length, "X");
}

type TxClient = Prisma.TransactionClient;

/**
 * Gera o código do equipamento no formato LOJA-SETOR-TIPO-NÚMERO (ex.:
 * NORD-COZ-GEL-00001), usando a mesma sequence real do Postgres já criada
 * pela coluna `sequence` — seguro contra concorrência, sem contador à parte.
 */
export async function generateEquipamentoCodigo(
  tx: TxClient,
  equipamentoId: string,
  sequence: number,
  empresaKey: string,
  setor: string,
  nome: string
): Promise<string> {
  const loja = slugPrefix(empresaKey.split("-")[0] ?? empresaKey, 4);
  const setorPrefix = slugPrefix(setor, 3);
  const tipoPrefix = slugPrefix(nome.split(" ")[0] ?? nome, 3);
  const codigo = `${loja}-${setorPrefix}-${tipoPrefix}-${String(sequence).padStart(3, "0")}`;
  await tx.equipamento.update({ where: { id: equipamentoId }, data: { codigo } });
  return codigo;
}

/** Gera o protocolo do chamado no formato CH-00001. */
export async function generateChamadoProtocolo(tx: TxClient, chamadoId: string, sequence: number): Promise<string> {
  const protocolo = `CH-${String(sequence).padStart(5, "0")}`;
  await tx.chamado.update({ where: { id: chamadoId }, data: { protocolo } });
  return protocolo;
}

export async function logChamadoHistorico(
  chamadoId: string,
  userId: string | null,
  action: string,
  detail?: string | null
): Promise<void> {
  await prisma.chamadoHistorico.create({ data: { chamadoId, userId, action, detail: detail ?? null } });
}

export async function notifyManutencaoUser(
  userId: string,
  type: string,
  title: string,
  body: string | null,
  chamadoId: string | null
): Promise<void> {
  await createNotification({
    userId,
    type,
    title,
    body,
    chamadoId,
    url: chamadoId ? `/portal/manutencao/chamados/${chamadoId}` : "/portal/manutencao",
  });
}

/** Gerentes/administradores com acesso à loja do chamado, para notificações de urgência. */
export async function getStoreManagers(empresaId: string): Promise<string[]> {
  const users = await prisma.user.findMany({
    where: {
      active: true,
      OR: [
        { role: { in: ["ADMINISTRADOR", "GESTOR"] } },
        { role: "GERENTE", empresaAccess: { some: { empresaId } } },
      ],
    },
    select: { id: true },
  });
  return users.map((u) => u.id);
}

export type StoreUserOption = { id: string; name: string; email: string; role: string };

/**
 * Todos os usuários ativos com acesso à loja (ADMINISTRADOR/GESTOR têm acesso
 * a todas as lojas; os demais cargos só se tiverem um `UserEmpresaAccess`
 * explícito pra essa loja) — mesmo critério de acesso usado em
 * `getUserEmpresas`/`getStoreManagers`, mas sem restringir a cargos de
 * gestão: usado pra popular o seletor de "quem recebe notificação de chamado
 * novo" (Manutenção > Configurações > Notificações), onde o objetivo é
 * permitir escolher qualquer pessoa da loja (ex.: um técnico COLABORADOR),
 * não só quem gerencia.
 */
export async function getStoreActiveUsers(empresaId: string): Promise<StoreUserOption[]> {
  return prisma.user.findMany({
    where: {
      active: true,
      OR: [{ role: { in: ["ADMINISTRADOR", "GESTOR"] } }, { empresaAccess: { some: { empresaId } } }],
    },
    select: { id: true, name: true, email: true, role: true },
    orderBy: { name: "asc" },
  });
}

/**
 * Ids dos usuários configurados (Manutenção > Configurações > Notificações,
 * model `ManutencaoNotificacaoDestinatario`) pra sempre serem notificados
 * quando um chamado novo é aberto nessa loja, independente de
 * prioridade/responsável. Filtra `active: true` no próprio join — alguém
 * desativado depois de configurado para de receber (mas a configuração em
 * si não é apagada; volta a valer se a conta for reativada).
 */
export async function getManutencaoNotificacaoDestinatarios(empresaId: string): Promise<string[]> {
  const destinatarios = await prisma.manutencaoNotificacaoDestinatario.findMany({
    where: { empresaId, user: { active: true } },
    select: { userId: true },
  });
  return destinatarios.map((d) => d.userId);
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

function nextOccurrenceDate(from: Date, frequencia: string, intervaloDiasCustom: number | null): Date | null {
  switch (frequencia) {
    case "SEMANAL":
      return addDays(from, 7);
    case "QUINZENAL":
      return addDays(from, 14);
    case "MENSAL":
      return addMonths(from, 1);
    case "BIMESTRAL":
      return addMonths(from, 2);
    case "TRIMESTRAL":
      return addMonths(from, 3);
    case "SEMESTRAL":
      return addMonths(from, 6);
    case "ANUAL":
      return addMonths(from, 12);
    case "PERSONALIZADA":
      return addDays(from, intervaloDiasCustom && intervaloDiasCustom > 0 ? intervaloDiasCustom : 30);
    default:
      return null; // NENHUMA — ocorrência única, sem repetição
  }
}

/**
 * Gera (de forma preguiçosa e idempotente) as próximas ocorrências de cada
 * manutenção preventiva ativa dentro da janela [hoje, hoje + horizonteDias],
 * chamado ao abrir o Calendário preventivo. Protegido pelo índice único
 * (preventivaId, dataProgramada): nunca duplica mesmo se rodar em paralelo.
 */
export async function generateDuePreventivaOcorrencias(empresaIds: string[], horizonteDias = 90): Promise<void> {
  const now = new Date();
  const horizonte = addDays(now, horizonteDias);

  const preventivas = await prisma.manutencaoPreventiva.findMany({
    where: { active: true, equipamento: { empresaId: { in: empresaIds } } },
    include: { ocorrencias: { orderBy: { dataProgramada: "desc" }, take: 1 } },
  });

  for (const preventiva of preventivas) {
    let cursor = preventiva.ocorrencias[0]?.dataProgramada ?? null;

    if (!cursor) {
      if (preventiva.dataInicio <= horizonte) {
        await prisma.manutencaoPreventivaOcorrencia.upsert({
          where: { preventivaId_dataProgramada: { preventivaId: preventiva.id, dataProgramada: preventiva.dataInicio } },
          update: {},
          create: { preventivaId: preventiva.id, dataProgramada: preventiva.dataInicio },
        });
      }
      cursor = preventiva.dataInicio;
    }

    if (preventiva.frequencia === "NENHUMA") continue;

    let next = nextOccurrenceDate(cursor, preventiva.frequencia, preventiva.intervaloDiasCustom);
    let guard = 0;
    while (next && next <= horizonte && guard < 60) {
      await prisma.manutencaoPreventivaOcorrencia.upsert({
        where: { preventivaId_dataProgramada: { preventivaId: preventiva.id, dataProgramada: next } },
        update: {},
        create: { preventivaId: preventiva.id, dataProgramada: next },
      });
      cursor = next;
      next = nextOccurrenceDate(cursor, preventiva.frequencia, preventiva.intervaloDiasCustom);
      guard++;
    }
  }
}

export type ManutencaoDashboardFiltros = {
  setor?: string;
  categoria?: string;
  prioridade?: string;
  status?: string;
  from?: Date;
  to?: Date;
};

export async function getManutencaoDashboardData(empresaIds: string[], filtros: ManutencaoDashboardFiltros = {}) {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const noventaDiasAtras = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

  const chamadoWhere: Prisma.ChamadoWhereInput = {
    empresaId: { in: empresaIds },
    ...(filtros.setor ? { setor: filtros.setor } : {}),
    ...(filtros.categoria ? { categoria: filtros.categoria as ChamadoCategoria } : {}),
    ...(filtros.prioridade ? { prioridade: filtros.prioridade as ChamadoPrioridade } : {}),
    ...(filtros.status ? { status: filtros.status as ChamadoStatus } : {}),
    ...(filtros.from || filtros.to
      ? { createdAt: { ...(filtros.from ? { gte: filtros.from } : {}), ...(filtros.to ? { lte: filtros.to } : {}) } }
      : {}),
  };

  const [
    chamadosAbertos,
    chamadosUrgentes,
    manutencoesAtrasadas,
    proximasManutencoesCount,
    equipamentosParados,
    gastosMes,
    resolvidosRecentes,
    chamadosRecentes,
    proximasManutencoesList,
    equipamentosPotenciaisCriticos,
  ] = await Promise.all([
    prisma.chamado.count({ where: { ...chamadoWhere, status: { notIn: ["RESOLVIDO", "CANCELADO"] } } }),
    prisma.chamado.count({
      where: { ...chamadoWhere, prioridade: "URGENTE", status: { notIn: ["RESOLVIDO", "CANCELADO"] } },
    }),
    prisma.chamado.count({
      where: { ...chamadoWhere, status: { notIn: ["RESOLVIDO", "CANCELADO"] }, prazo: { lt: now } },
    }),
    prisma.equipamento.count({
      where: {
        empresaId: { in: empresaIds },
        proximaManutencaoEm: { gte: now, lte: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000) },
      },
    }),
    prisma.equipamento.count({ where: { empresaId: { in: empresaIds }, status: "PARADO" } }),
    prisma.manutencaoRegistro.aggregate({
      where: { empresaId: { in: empresaIds }, data: { gte: startOfMonth } },
      _sum: { valorTotal: true },
    }),
    prisma.chamado.findMany({
      where: { empresaId: { in: empresaIds }, status: "RESOLVIDO", resolvidoEm: { not: null } },
      select: { createdAt: true, resolvidoEm: true },
      take: 200,
      orderBy: { resolvidoEm: "desc" },
    }),
    prisma.chamado.findMany({
      where: chamadoWhere,
      orderBy: { createdAt: "desc" },
      take: 10,
      include: {
        equipamento: { select: { nome: true, codigo: true, fotoUrl: true } },
        empresa: { select: { name: true, color: true } },
        responsavel: { select: { name: true } },
        anexos: { where: { tipo: "FOTO" }, take: 1, select: { fileUrl: true } },
      },
    }),
    prisma.equipamento.findMany({
      where: {
        empresaId: { in: empresaIds },
        proximaManutencaoEm: { not: null, gte: now, lte: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000) },
      },
      orderBy: { proximaManutencaoEm: "asc" },
      take: 10,
      include: { empresa: { select: { name: true, color: true } } },
    }),
    prisma.equipamento.findMany({
      where: {
        empresaId: { in: empresaIds },
        OR: [{ status: "PARADO" }, { proximaManutencaoEm: { lt: now } }],
      },
      include: {
        empresa: { select: { name: true, color: true } },
        _count: { select: { chamados: { where: { createdAt: { gte: noventaDiasAtras } } } } },
      },
      take: 20,
    }),
  ]);

  const temposResolucao = resolvidosRecentes
    .filter((c) => c.resolvidoEm)
    .map((c) => (c.resolvidoEm as Date).getTime() - c.createdAt.getTime());
  const tempoMedioResolucaoHoras =
    temposResolucao.length > 0
      ? temposResolucao.reduce((sum, ms) => sum + ms, 0) / temposResolucao.length / (1000 * 60 * 60)
      : null;

  const equipamentosCriticos = equipamentosPotenciaisCriticos
    .filter((e) => e.status === "PARADO" || (e.proximaManutencaoEm && e.proximaManutencaoEm < now) || e._count.chamados >= 3)
    .slice(0, 10);

  return {
    kpis: {
      chamadosAbertos,
      chamadosUrgentes,
      manutencoesAtrasadas,
      proximasManutencoes: proximasManutencoesCount,
      equipamentosParados,
      gastosMes: gastosMes._sum.valorTotal ?? 0,
      tempoMedioResolucaoHoras,
    },
    chamadosRecentes,
    proximasManutencoesList,
    equipamentosCriticos,
  };
}
