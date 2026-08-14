import { prisma } from "@/lib/prisma";
import { growth } from "@/lib/calc";
import { startOfDay, subDays } from "date-fns";
import {
  computeClienteMetrics,
  computeDashboardSummary,
  bucketRiskDistribution,
  bucketFrequencia,
  buildInsights,
  resolveCrmPeriod,
  isReativacao,
  type CrmPeriodKey,
} from "@/lib/crm";

async function loadClientesComVendas(empresaIds: string[]) {
  return prisma.cliente.findMany({
    where: { empresaId: { in: empresaIds } },
    select: {
      id: true,
      empresaId: true,
      nome: true,
      telefone: true,
      whatsapp: true,
      email: true,
      dataNascimento: true,
      endereco: true,
      bairro: true,
      cidade: true,
      canalPreferido: true,
      createdAt: true,
      vendas: { select: { id: true, dateTime: true, valorTotal: true, channel: true } },
    },
  });
}

export async function getCrmDashboardData(
  empresaIds: string[],
  key: CrmPeriodKey,
  custom?: { from?: string; to?: string }
) {
  const { from: periodFrom, to: periodTo, prevFrom, prevTo } = resolveCrmPeriod(key, custom);

  const [clientes, npsPendentes] = await Promise.all([
    loadClientesComVendas(empresaIds),
    prisma.npsResponse.count({ where: { empresaId: { in: empresaIds }, nota: { lte: 6 }, status: "PENDENTE" } }),
  ]);

  const summary = computeDashboardSummary(clientes, periodFrom, periodTo);
  const prevSummary = computeDashboardSummary(clientes, prevFrom, prevTo);

  const metrics = computeClienteMetrics(clientes);
  const risco = bucketRiskDistribution(metrics);
  const frequencia = bucketFrequencia(metrics);
  const insights = buildInsights(metrics);
  const metricsById = new Map(metrics.map((m) => [m.id, m]));

  const now = new Date();
  const aniversariantesHoje = metrics.filter(
    (m) => m.dataNascimento && m.dataNascimento.getMonth() === now.getMonth() && m.dataNascimento.getDate() === now.getDate()
  ).length;
  const emRiscoOuInativo = metrics.filter(
    (m) => (m.status === "EM_RISCO" || m.status === "INATIVO") && (m.diasDesdeUltimaCompra ?? 0) > 45
  ).length;
  const vipProximos = metrics.filter((m) => {
    if (m.status !== "VIP" || !m.frequenciaMediaDias || m.diasDesdeUltimaCompra === null) return false;
    return m.diasDesdeUltimaCompra >= m.frequenciaMediaDias * 0.8 && m.diasDesdeUltimaCompra <= m.frequenciaMediaDias * 1.2;
  }).length;
  const novosSemSegunda = metrics.filter((m) => m.ehNovo && m.pedidos === 1).length;
  const aumentandoFrequencia = metrics.filter(
    (m) => m.status === "RECORRENTE" && m.frequenciaMediaDias !== null && m.frequenciaMediaDias <= 20
  ).length;

  const oportunidades = [
    { key: "reativar", label: "clientes para reativar", count: emRiscoOuInativo, icon: "AlertTriangle", href: "/portal/crm/clientes?status=EM_RISCO,INATIVO" },
    { key: "aniversariantes", label: "aniversariantes hoje", count: aniversariantesHoje, icon: "Cake", href: "/portal/crm/aniversariantes" },
    { key: "vip", label: "clientes VIP próximos da recompra", count: vipProximos, icon: "Crown", href: "/portal/crm/clientes?status=VIP" },
    { key: "nps", label: "avaliações negativas aguardando contato", count: npsPendentes, icon: "Frown", href: "/portal/crm/satisfacao" },
    { key: "segunda-compra", label: "novos clientes ainda sem segunda compra", count: novosSemSegunda, icon: "UserPlus", href: "/portal/crm/clientes?status=ATIVO" },
    { key: "frequencia", label: "clientes aumentaram a frequência de compra", count: aumentandoFrequencia, icon: "TrendingUp", href: "/portal/crm/clientes?status=RECORRENTE" },
  ].filter((o) => o.count > 0);

  const receitaPorTipo = [
    { tipo: "Novos", receita: 0 },
    { tipo: "Recorrentes", receita: 0 },
    { tipo: "VIP", receita: 0 },
    { tipo: "Reativados", receita: 0 },
  ];
  for (const c of clientes) {
    const vendasPeriodo = c.vendas.filter((v) => v.dateTime >= periodFrom && v.dateTime <= periodTo);
    if (vendasPeriodo.length === 0) continue;
    const m = metricsById.get(c.id);
    const receita = vendasPeriodo.reduce((s, v) => s + v.valorTotal, 0);
    if (!m) continue;
    if (m.ehNovo) receitaPorTipo[0].receita += receita;
    else if (m.status === "VIP") receitaPorTipo[2].receita += receita;
    else if (m.pedidos >= 2) receitaPorTipo[1].receita += receita;
    else receitaPorTipo[3].receita += receita;
  }

  const vendasOrdenadasPorCliente = new Map(
    clientes.map((c) => [c.id, [...c.vendas].sort((a, b) => a.dateTime.getTime() - b.dateTime.getTime())])
  );

  const dias = Math.max(1, Math.round((periodTo.getTime() - periodFrom.getTime()) / 86400000));
  const bucketCount = Math.min(30, dias);
  const evolucao = Array.from({ length: bucketCount }, (_, idx) => {
    const dayStart = startOfDay(subDays(periodTo, bucketCount - 1 - idx));
    const dayEnd = new Date(dayStart.getTime() + 86400000 - 1);
    let novos = 0;
    let recorrentes = 0;
    let reativados = 0;
    for (const c of clientes) {
      const vendasOrdenadas = vendasOrdenadasPorCliente.get(c.id) ?? [];
      const vendasDia = vendasOrdenadas.filter((v) => v.dateTime >= dayStart && v.dateTime <= dayEnd);
      if (vendasDia.length === 0) continue;
      const m = metricsById.get(c.id);
      if (!m) continue;
      if (c.createdAt >= dayStart && c.createdAt <= dayEnd) novos++;
      else if (vendasDia.some((v) => isReativacao(vendasOrdenadas, v))) reativados++;
      else if (m.pedidos >= 2) recorrentes++;
    }
    return {
      date: dayStart.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
      novos,
      recorrentes,
      reativados,
    };
  });

  return {
    summary,
    deltas: {
      totalClientes: growth(summary.totalClientes, prevSummary.totalClientes),
      clientesAtivosPeriodo: growth(summary.clientesAtivosPeriodo, prevSummary.clientesAtivosPeriodo),
      novosClientes: growth(summary.novosClientes, prevSummary.novosClientes),
      clientesRecorrentes: growth(summary.clientesRecorrentes, prevSummary.clientesRecorrentes),
      clientesReativados: growth(summary.clientesReativados, prevSummary.clientesReativados),
      clientesInativos: growth(summary.clientesInativos, prevSummary.clientesInativos),
      taxaRecompra: growth(summary.taxaRecompra, prevSummary.taxaRecompra),
      ticketMedio: growth(summary.ticketMedio, prevSummary.ticketMedio),
      frequenciaMedia: growth(summary.frequenciaMedia ?? 0, prevSummary.frequenciaMedia ?? 0),
      ltvMedio: growth(summary.ltvMedio, prevSummary.ltvMedio),
      receitaBase: growth(summary.receitaBase, prevSummary.receitaBase),
      receitaRecuperada: growth(summary.receitaRecuperada, prevSummary.receitaRecuperada),
    },
    risco,
    frequencia,
    receitaPorTipo,
    evolucao,
    insights,
    oportunidades,
  };
}

export type CrmDashboardData = Awaited<ReturnType<typeof getCrmDashboardData>>;
