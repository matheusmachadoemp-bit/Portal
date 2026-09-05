import { prisma } from "@/lib/prisma";
import type { Prisma, ChamadoCategoria, ChamadoPrioridade, ChamadoStatus } from "@prisma/client";

export const MANAGER_ROLES = ["ADMINISTRADOR", "GESTOR", "GERENTE", "SUPERVISOR"];

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
  await prisma.notification.create({ data: { userId, type, title, body, chamadoId } });
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
