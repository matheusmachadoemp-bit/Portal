import { prisma } from "@/lib/prisma";
import { PageContainer } from "@/components/page-container";
import { DashboardClient } from "./dashboard/dashboard-client";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";
import { computeHrInsights } from "@/lib/rh-insights";
import { startOfMonth, subMonths, addMonths, format, differenceInYears } from "date-fns";

export default async function RhPage() {
  const ctx = await getActiveEmpresaContext();
  const empresaIds = ctx ? empresaIdsForContext(ctx) : [];

  const now = new Date();
  const monthStart = startOfMonth(now);
  const monthEnd = addMonths(monthStart, 1);
  const sixMonthsAgo = startOfMonth(subMonths(now, 5));

  const [employees, occurrencesThisMonth, timeEntriesThisMonth, financeLast6Months, insights] = await Promise.all([
    prisma.employee.findMany({ where: { empresaId: { in: empresaIds } } }),
    prisma.occurrence.findMany({
      where: { date: { gte: monthStart, lt: monthEnd }, employee: { empresaId: { in: empresaIds } } },
      include: { employee: { select: { name: true, setor: true } } },
    }),
    prisma.timeEntry.findMany({ where: { date: { gte: monthStart, lt: monthEnd }, empresaId: { in: empresaIds } } }),
    prisma.employeeFinanceEntry.findMany({ where: { date: { gte: sixMonthsAgo }, empresaId: { in: empresaIds } } }),
    computeHrInsights(empresaIds),
  ]);

  const months = Array.from({ length: 6 }).map((_, i) => startOfMonth(subMonths(now, 5 - i)));

  function turnoverAt(start: Date, end: Date) {
    const ativosInicio = employees.filter((e) => e.admissionDate <= start && (!e.terminationDate || e.terminationDate >= start)).length;
    const ativosFim = employees.filter((e) => e.admissionDate <= end && (!e.terminationDate || e.terminationDate >= end)).length;
    const desligados = employees.filter(
      (e) => e.status === "DESLIGADO" && e.terminationDate && e.terminationDate >= start && e.terminationDate < end
    ).length;
    const quadroMedio = (ativosInicio + ativosFim) / 2;
    return quadroMedio > 0 ? (desligados / quadroMedio) * 100 : 0;
  }

  const turnoverMensal = months.map((m) => {
    const end = addMonths(m, 1);
    return { mes: format(m, "MM/yyyy"), turnover: Math.round(turnoverAt(m, end) * 10) / 10 };
  });

  const admissoesXDemissoes = months.map((m) => {
    const end = addMonths(m, 1);
    const admissoes = employees.filter((e) => e.admissionDate >= m && e.admissionDate < end).length;
    const demissoes = employees.filter((e) => e.status === "DESLIGADO" && e.terminationDate && e.terminationDate >= m && e.terminationDate < end).length;
    return { mes: format(m, "MM/yyyy"), admissoes, demissoes };
  });

  const custosFolha = months.map((m) => {
    const end = addMonths(m, 1);
    const entries = financeLast6Months.filter((f) => f.date >= m && f.date < end);
    const total = entries.reduce((sum, f) => sum + (f.type === "DESCONTO" ? -f.value : f.value), 0);
    return { mes: format(m, "MM/yyyy"), valor: Math.max(0, Math.round(total)) };
  });

  const faltasPorSetorMap = new Map<string, number>();
  occurrencesThisMonth.filter((o) => o.type === "FALTA").forEach((o) => {
    faltasPorSetorMap.set(o.employee.setor, (faltasPorSetorMap.get(o.employee.setor) ?? 0) + 1);
  });
  const faltasPorSetor = [...faltasPorSetorMap.entries()].map(([setor, faltas]) => ({ setor, faltas }));

  const atrasosPorColaboradorMap = new Map<string, number>();
  occurrencesThisMonth.filter((o) => o.type === "ATRASO").forEach((o) => {
    atrasosPorColaboradorMap.set(o.employee.name, (atrasosPorColaboradorMap.get(o.employee.name) ?? 0) + 1);
  });
  const atrasosPorColaborador = [...atrasosPorColaboradorMap.entries()]
    .map(([nome, atrasos]) => ({ nome, atrasos }))
    .sort((a, b) => b.atrasos - a.atrasos)
    .slice(0, 10);

  const ativos = employees.filter((e) => e.status === "ATIVO");
  const tempoMedioAnos = ativos.length > 0 ? ativos.reduce((sum, e) => sum + differenceInYears(now, e.admissionDate), 0) / ativos.length : 0;

  const kpis = {
    totalColaboradores: employees.length,
    ativos: ativos.length,
    ferias: employees.filter((e) => e.status === "FERIAS").length,
    afastados: employees.filter((e) => e.status === "AFASTADO").length,
    desligamentosMes: employees.filter((e) => e.status === "DESLIGADO" && e.terminationDate && e.terminationDate >= monthStart && e.terminationDate < monthEnd).length,
    admissoesMes: employees.filter((e) => e.admissionDate >= monthStart && e.admissionDate < monthEnd).length,
    turnoverMes: turnoverMensal[turnoverMensal.length - 1]?.turnover ?? 0,
    faltasMes: occurrencesThisMonth.filter((o) => o.type === "FALTA").length,
    atrasosMes: occurrencesThisMonth.filter((o) => o.type === "ATRASO").length,
    advertenciasMes: occurrencesThisMonth.filter((o) => o.type === "ADVERTENCIA").length,
    suspensoesMes: occurrencesThisMonth.filter((o) => o.type === "SUSPENSAO").length,
    horasTrabalhadasMes: timeEntriesThisMonth.reduce((s, t) => s + t.horasTrabalhadas, 0),
    bancoHorasMes: timeEntriesThisMonth.reduce((s, t) => s + (t.horasTrabalhadas - 8), 0),
    tempoMedioAnos,
  };

  return (
    <PageContainer title="RH" subtitle="Dashboard Geral">
      <DashboardClient
        kpis={kpis}
        turnoverMensal={turnoverMensal}
        admissoesXDemissoes={admissoesXDemissoes}
        custosFolha={custosFolha}
        faltasPorSetor={faltasPorSetor}
        atrasosPorColaborador={atrasosPorColaborador}
        insights={insights}
      />
    </PageContainer>
  );
}
