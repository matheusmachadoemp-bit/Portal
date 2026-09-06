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

export type ManutencaoRelatorioFiltros = {
  from?: Date;
  to?: Date;
  setor?: string;
  categoria?: string;
  equipamentoId?: string;
  prestadorId?: string;
  status?: string;
};

function sumBy<T>(items: T[], keyFn: (item: T) => string, valueFn: (item: T) => number): { key: string; valor: number }[] {
  const map = new Map<string, number>();
  for (const item of items) {
    const key = keyFn(item);
    map.set(key, (map.get(key) ?? 0) + valueFn(item));
  }
  return [...map.entries()].map(([key, valor]) => ({ key, valor })).sort((a, b) => b.valor - a.valor);
}

function countBy<T>(items: T[], keyFn: (item: T) => string): { key: string; total: number }[] {
  const map = new Map<string, number>();
  for (const item of items) {
    const key = keyFn(item);
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return [...map.entries()].map(([key, total]) => ({ key, total })).sort((a, b) => b.total - a.total);
}

export async function getManutencaoRelatorioData(empresaIds: string[], filtros: ManutencaoRelatorioFiltros = {}) {
  const now = new Date();

  const registroWhere: Prisma.ManutencaoRegistroWhereInput = {
    empresaId: { in: empresaIds },
    ...(filtros.from || filtros.to
      ? { data: { ...(filtros.from ? { gte: filtros.from } : {}), ...(filtros.to ? { lte: filtros.to } : {}) } }
      : {}),
    ...(filtros.equipamentoId ? { equipamentoId: filtros.equipamentoId } : {}),
    ...(filtros.prestadorId ? { prestadorId: filtros.prestadorId } : {}),
    ...(filtros.setor || filtros.categoria
      ? {
          equipamento: {
            ...(filtros.setor ? { setor: filtros.setor } : {}),
            ...(filtros.categoria ? { categoria: filtros.categoria } : {}),
          },
        }
      : {}),
  };

  const chamadoWhere: Prisma.ChamadoWhereInput = {
    empresaId: { in: empresaIds },
    ...(filtros.from || filtros.to
      ? { createdAt: { ...(filtros.from ? { gte: filtros.from } : {}), ...(filtros.to ? { lte: filtros.to } : {}) } }
      : {}),
    ...(filtros.setor ? { setor: filtros.setor } : {}),
    ...(filtros.categoria ? { categoria: filtros.categoria as ChamadoCategoria } : {}),
    ...(filtros.equipamentoId ? { equipamentoId: filtros.equipamentoId } : {}),
    ...(filtros.status ? { status: filtros.status as ChamadoStatus } : {}),
  };

  const [registros, chamados, equipamentos, preventivaOcorrencias, equipamentosParados] = await Promise.all([
    prisma.manutencaoRegistro.findMany({
      where: registroWhere,
      include: {
        equipamento: { select: { id: true, nome: true, codigo: true, setor: true, categoria: true, valorCompra: true, empresa: { select: { name: true } } } },
        prestadorCadastrado: { select: { nome: true } },
      },
    }),
    prisma.chamado.findMany({
      where: chamadoWhere,
      select: { id: true, setor: true, prioridade: true, createdAt: true, resolvidoEm: true, status: true },
    }),
    prisma.equipamento.findMany({
      where: { empresaId: { in: empresaIds } },
      select: { id: true, nome: true, codigo: true, valorCompra: true },
    }),
    prisma.manutencaoPreventivaOcorrencia.findMany({
      where: { preventiva: { equipamento: { empresaId: { in: empresaIds } } } },
      select: { status: true, dataProgramada: true },
    }),
    prisma.equipamento.count({ where: { empresaId: { in: empresaIds }, status: "PARADO" } }),
  ]);

  const custoTotal = registros.reduce((s, r) => s + r.valorTotal, 0);
  const gastosPorLoja = sumBy(registros, (r) => r.equipamento.empresa.name, (r) => r.valorTotal);
  const gastosPorSetor = sumBy(registros, (r) => r.equipamento.setor, (r) => r.valorTotal);
  const gastosPorCategoria = sumBy(registros, (r) => r.equipamento.categoria, (r) => r.valorTotal);
  const gastosPorPrestador = sumBy(registros, (r) => r.prestadorCadastrado?.nome ?? r.prestador ?? "Não informado", (r) => r.valorTotal);
  const gastosPorEquipamento = sumBy(registros, (r) => `${r.equipamento.nome} (${r.equipamento.codigo})`, (r) => r.valorTotal).slice(0, 10);

  const equipamentosComMaisProblemas = (
    await prisma.chamado.groupBy({
      by: ["equipamentoId"],
      where: { ...chamadoWhere, equipamentoId: { not: null } },
      _count: { _all: true },
    })
  )
    .sort((a, b) => b._count._all - a._count._all)
    .slice(0, 10)
    .map((g) => {
      const eq = equipamentos.find((e) => e.id === g.equipamentoId);
      return { key: eq ? `${eq.nome} (${eq.codigo})` : "—", total: g._count._all };
    });

  const chamadosPorSetor = countBy(chamados, (c) => c.setor);
  const chamadosPorPrioridade = countBy(chamados, (c) => c.prioridade);

  const resolvidos = chamados.filter((c) => c.resolvidoEm);
  const tempoMedioResolucaoHoras =
    resolvidos.length > 0
      ? resolvidos.reduce((s, c) => s + ((c.resolvidoEm as Date).getTime() - c.createdAt.getTime()), 0) / resolvidos.length / (1000 * 60 * 60)
      : null;

  const preventivasConcluidas = preventivaOcorrencias.filter((o) => o.status === "CONCLUIDA").length;
  const preventivasAtrasadas = preventivaOcorrencias.filter((o) => o.status === "PROGRAMADA" && o.dataProgramada < now).length;
  const preventivasNoPrazoPercent =
    preventivasConcluidas + preventivasAtrasadas > 0
      ? (preventivasConcluidas / (preventivasConcluidas + preventivasAtrasadas)) * 100
      : null;

  const custoAcumuladoPorEquipamento = sumBy(registros, (r) => r.equipamentoId, (r) => r.valorTotal);
  const comparativoSubstituicao = equipamentos
    .map((e) => {
      const acumulado = custoAcumuladoPorEquipamento.find((c) => c.key === e.id)?.valor ?? 0;
      return { nome: `${e.nome} (${e.codigo})`, custoAcumulado: acumulado, valorCompra: e.valorCompra ?? 0 };
    })
    .filter((e) => e.valorCompra > 0 && e.custoAcumulado > e.valorCompra * 0.5)
    .sort((a, b) => b.custoAcumulado / (b.valorCompra || 1) - a.custoAcumulado / (a.valorCompra || 1));

  return {
    custoTotal,
    gastosPorLoja,
    gastosPorSetor,
    gastosPorCategoria,
    gastosPorPrestador,
    gastosPorEquipamento,
    equipamentosComMaisProblemas,
    chamadosPorSetor,
    chamadosPorPrioridade,
    tempoMedioResolucaoHoras,
    preventivasConcluidas,
    preventivasAtrasadas,
    preventivasNoPrazoPercent,
    equipamentosParados,
    comparativoSubstituicao,
    totalChamados: chamados.length,
    totalRegistros: registros.length,
  };
}
