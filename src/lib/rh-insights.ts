import { prisma } from "@/lib/prisma";
import { startOfMonth, subMonths, differenceInMonths, differenceInDays } from "date-fns";

export type HrInsight = {
  title: string;
  detail: string;
  tone: "info" | "warning" | "danger" | "success";
  action: string;
};

/**
 * Motor de regras do painel "Inteligência RH": analisa os dados reais do banco
 * (sem chamada a API de IA) e gera insights + ações sugeridas para o gestor.
 */
export async function computeHrInsights(empresaIds: string[]): Promise<HrInsight[]> {
  if (empresaIds.length === 0) return [];

  const now = new Date();
  const monthStart = startOfMonth(now);
  const prevMonthStart = startOfMonth(subMonths(now, 1));

  const [employees, occurrencesThisMonth, occurrencesPrevMonth, financeThisMonth, vacations, documents] =
    await Promise.all([
      // `include: { user: ... }` aqui é usado só pelo insight #8 (treinamento em atraso) abaixo,
      // pra ter o id do `User` vinculado (se existir) e buscar o treinamento real na Universidade
      // em vez do campo morto `Employee.lastTrainingDate`.
      prisma.employee.findMany({
        where: { empresaId: { in: empresaIds } },
        include: { user: { select: { id: true } } },
      }),
      prisma.occurrence.findMany({
        where: { date: { gte: monthStart }, employee: { empresaId: { in: empresaIds } } },
        include: { employee: { select: { id: true, name: true, setor: true } } },
      }),
      prisma.occurrence.findMany({
        where: { date: { gte: prevMonthStart, lt: monthStart }, employee: { empresaId: { in: empresaIds } } },
        include: { employee: { select: { setor: true } } },
      }),
      prisma.employeeFinanceEntry.findMany({
        where: { date: { gte: monthStart }, empresaId: { in: empresaIds }, type: "COMISSAO" },
        include: { employee: { select: { name: true, setor: true } } },
      }),
      prisma.vacation.findMany({ where: { empresaId: { in: empresaIds } }, include: { employee: { select: { name: true } } } }),
      prisma.employeeDocument.findMany({ where: { empresaId: { in: empresaIds } } }),
    ]);

  const insights: HrInsight[] = [];

  // 1. Ranking de atrasos do mês
  const atrasosPorColaborador = new Map<string, number>();
  occurrencesThisMonth
    .filter((o) => o.type === "ATRASO")
    .forEach((o) => atrasosPorColaborador.set(o.employee.name, (atrasosPorColaborador.get(o.employee.name) ?? 0) + 1));
  const topAtrasos = [...atrasosPorColaborador.entries()].sort((a, b) => b[1] - a[1])[0];
  if (topAtrasos && topAtrasos[1] >= 3) {
    insights.push({
      title: "Atrasos recorrentes",
      detail: `${topAtrasos[0]} teve ${topAtrasos[1]} atrasos este mês.`,
      tone: "warning",
      action: "Conversar com o colaborador e avaliar necessidade de advertência formal.",
    });
  }

  // 2. Maior índice de faltas
  const faltasPorColaborador = new Map<string, number>();
  occurrencesThisMonth
    .filter((o) => o.type === "FALTA")
    .forEach((o) => faltasPorColaborador.set(o.employee.name, (faltasPorColaborador.get(o.employee.name) ?? 0) + 1));
  const topFaltas = [...faltasPorColaborador.entries()].sort((a, b) => b[1] - a[1])[0];
  if (topFaltas && topFaltas[1] >= 2) {
    insights.push({
      title: "Maior índice de faltas",
      detail: `${topFaltas[0]} acumula ${topFaltas[1]} faltas este mês.`,
      tone: "danger",
      action: "Solicitar justificativa e verificar padrão de ausências recorrentes.",
    });
  }

  // 3. Férias vencidas
  const feriasVencidas = vacations.filter(
    (v) => v.status !== "CONCLUIDA" && v.status !== "CANCELADA" && v.periodoAquisitivoFim < now
  );
  if (feriasVencidas.length > 0) {
    const nomes = feriasVencidas.slice(0, 3).map((v) => v.employee.name).join(", ");
    insights.push({
      title: "Férias vencidas",
      detail: `${feriasVencidas.length} colaborador${feriasVencidas.length > 1 ? "es" : ""} com férias vencidas: ${nomes}${feriasVencidas.length > 3 ? "..." : ""}.`,
      tone: "danger",
      action: "Programar as férias vencidas imediatamente para evitar passivo trabalhista.",
    });
  }

  // 4. Maior comissão do mês
  const comissaoPorColaborador = new Map<string, { name: string; setor: string; total: number }>();
  financeThisMonth.forEach((f) => {
    const cur = comissaoPorColaborador.get(f.employeeId) ?? { name: f.employee.name, setor: f.employee.setor, total: 0 };
    cur.total += f.value;
    comissaoPorColaborador.set(f.employeeId, cur);
  });
  const topComissao = [...comissaoPorColaborador.values()].sort((a, b) => b.total - a.total)[0];
  if (topComissao) {
    insights.push({
      title: "Destaque em comissões",
      detail: `${topComissao.name} (${topComissao.setor}) recebeu a maior comissão do mês: ${topComissao.total.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}.`,
      tone: "success",
      action: "Reconhecer publicamente o desempenho na reunião de equipe.",
    });
  }

  // 5. Variação de atrasos por setor
  const atrasosPorSetor = (list: typeof occurrencesThisMonth) => {
    const map = new Map<string, number>();
    list.filter((o) => o.type === "ATRASO").forEach((o) => map.set(o.employee.setor, (map.get(o.employee.setor) ?? 0) + 1));
    return map;
  };
  const setorAtual = atrasosPorSetor(occurrencesThisMonth);
  const setorAnterior = atrasosPorSetor(occurrencesPrevMonth as typeof occurrencesThisMonth);
  let piorSetor: { setor: string; variacao: number } | null = null;
  for (const [setor, atual] of setorAtual.entries()) {
    const anterior = setorAnterior.get(setor) ?? 0;
    if (anterior === 0) continue;
    const variacao = ((atual - anterior) / anterior) * 100;
    if (variacao > 20 && (!piorSetor || variacao > piorSetor.variacao)) {
      piorSetor = { setor, variacao };
    }
  }
  if (piorSetor) {
    insights.push({
      title: "Aumento de atrasos por setor",
      detail: `Equipe de ${piorSetor.setor} aumentou ${Math.round(piorSetor.variacao)}% nos atrasos em relação ao mês anterior.`,
      tone: "warning",
      action: "Investigar causas (escala, transporte, liderança) junto ao supervisor do setor.",
    });
  }

  // 6. Documentos vencendo
  const documentosVencendo = documents.filter((d) => {
    if (!d.validade) return false;
    const dias = differenceInDays(d.validade, now);
    return dias >= 0 && dias <= 30;
  });
  if (documentosVencendo.length > 0) {
    insights.push({
      title: "Documentos vencendo",
      detail: `Existem ${documentosVencendo.length} documento${documentosVencendo.length > 1 ? "s" : ""} vencendo nos próximos 30 dias.`,
      tone: "warning",
      action: "Solicitar renovação dos documentos antes do vencimento.",
    });
  }

  // 7. Tendência de turnover
  const turnoverOf = (start: Date, end: Date) => {
    const ativosInicio = employees.filter((e) => e.admissionDate <= start && (!e.terminationDate || e.terminationDate >= start)).length;
    const ativosFim = employees.filter((e) => e.admissionDate <= end && (!e.terminationDate || e.terminationDate >= end)).length;
    const desligados = employees.filter((e) => e.status === "DESLIGADO" && e.terminationDate && e.terminationDate >= start && e.terminationDate < end).length;
    const quadroMedio = (ativosInicio + ativosFim) / 2;
    return quadroMedio > 0 ? (desligados / quadroMedio) * 100 : 0;
  };
  const turnoverAtual = turnoverOf(monthStart, now);
  const turnoverAnterior = turnoverOf(prevMonthStart, monthStart);
  if (turnoverAnterior > 0 && turnoverAtual > turnoverAnterior * 1.15) {
    const variacao = ((turnoverAtual - turnoverAnterior) / turnoverAnterior) * 100;
    insights.push({
      title: "Turnover em alta",
      detail: `O índice de turnover aumentou ${Math.round(variacao)}% em relação ao mês anterior.`,
      tone: "danger",
      action: "Revisar motivos de desligamento recentes e ações de retenção.",
    });
  }

  // 8. Treinamento atrasado
  //
  // Antes lia `Employee.lastTrainingDate`, um campo de texto/data livre preenchido manualmente na
  // ficha do colaborador — na prática, NUNCA preenchido por ninguém (não existe nenhuma tela no
  // Portal que grave esse campo), então todo colaborador ativo caía sempre no ramo "nunca
  // treinou" aqui, mesmo quem de fato treinou bastante na Universidade Grupo Nord. Trocado para
  // ler o dado real via o vínculo 1:1 já existente `User.employeeId` -> `TrainingEnrollment`
  // (curso concluído) e `TrainingCertificate` (certificado de módulo emitido), usando a data mais
  // recente entre os dois como "último treinamento" da pessoa.
  //
  // Colaborador SEM `Employee.user` (sem login no Portal) não tem como ter dado de treinamento da
  // Universidade — como a tela de Colaboradores do RH não distingue hoje entre "não tem login" e
  // "tem login, mas nunca treinou", decidimos aqui, dentro deste insight, EXCLUIR quem não tem
  // login do cálculo (nem conta como "treinado" nem como "atrasado"), em vez de forçar um falso
  // positivo de "nunca treinou" só por falta de login. Quem tem login mas nenhum
  // `TrainingEnrollment` concluído/`TrainingCertificate` continua contando como "atenção" (mesmo
  // comportamento de antes para quem de fato nunca treinou).
  type EmployeeComLogin = (typeof employees)[number] & { user: { id: string } };
  const ativos = employees.filter((e) => e.status === "ATIVO");
  const ativosComLogin = ativos.filter((e): e is EmployeeComLogin => e.user !== null);
  const userIdsComLogin = ativosComLogin.map((e) => e.user.id);

  const [enrollmentMaxByUser, certificateMaxByUser] = userIdsComLogin.length
    ? await Promise.all([
        prisma.trainingEnrollment.groupBy({
          by: ["userId"],
          where: { userId: { in: userIdsComLogin }, status: "CONCLUIDO" },
          _max: { completedAt: true },
        }),
        prisma.trainingCertificate.groupBy({
          by: ["userId"],
          where: { userId: { in: userIdsComLogin } },
          _max: { issuedAt: true },
        }),
      ])
    : [[], []];

  const ultimoTreinamentoPorUserId = new Map<string, Date>();
  for (const row of enrollmentMaxByUser) {
    if (row._max.completedAt) ultimoTreinamentoPorUserId.set(row.userId, row._max.completedAt);
  }
  for (const row of certificateMaxByUser) {
    if (!row._max.issuedAt) continue;
    const atual = ultimoTreinamentoPorUserId.get(row.userId);
    if (!atual || row._max.issuedAt > atual) ultimoTreinamentoPorUserId.set(row.userId, row._max.issuedAt);
  }

  const semTreinamento = ativosComLogin.filter((e) => {
    const ultimo = ultimoTreinamentoPorUserId.get(e.user.id);
    if (!ultimo) return true;
    return differenceInMonths(now, ultimo) >= 6;
  });
  if (semTreinamento.length > 0) {
    const destaque = semTreinamento[0];
    const ultimoDestaque = ultimoTreinamentoPorUserId.get(destaque.user.id);
    const meses = ultimoDestaque ? differenceInMonths(now, ultimoDestaque) : null;
    insights.push({
      title: "Treinamento em atraso",
      detail: meses
        ? `O colaborador ${destaque.name} não realiza treinamentos há ${meses} meses.`
        : `${semTreinamento.length} colaborador${semTreinamento.length > 1 ? "es" : ""} sem registro de treinamento.`,
      tone: "warning",
      action: "Agendar treinamento obrigatório na Universidade Grupo Nord.",
    });
  }

  // 9. Destaque do mês (elogios)
  const elogiosPorColaborador = new Map<string, number>();
  occurrencesThisMonth
    .filter((o) => o.type === "ELOGIO")
    .forEach((o) => elogiosPorColaborador.set(o.employee.name, (elogiosPorColaborador.get(o.employee.name) ?? 0) + 1));
  const topElogios = [...elogiosPorColaborador.entries()].sort((a, b) => b[1] - a[1])[0];
  if (topElogios) {
    insights.push({
      title: "Funcionário destaque do mês",
      detail: `${topElogios[0]} recebeu ${topElogios[1]} elogio${topElogios[1] > 1 ? "s" : ""} este mês.`,
      tone: "success",
      action: "Considerar para bonificação ou reconhecimento formal.",
    });
  }

  // 10. Risco de desligamento (heurística simples)
  const advertenciasPorColaborador = new Map<string, number>();
  occurrencesThisMonth
    .filter((o) => o.type === "ADVERTENCIA" || o.type === "SUSPENSAO")
    .forEach((o) => advertenciasPorColaborador.set(o.employeeId, (advertenciasPorColaborador.get(o.employeeId) ?? 0) + 1));
  const risco = employees.find((e) => {
    const atrasos = atrasosPorColaborador.get(e.name) ?? 0;
    const disciplinares = advertenciasPorColaborador.get(e.id) ?? 0;
    return e.status === "ATIVO" && (disciplinares >= 1 || atrasos >= 4);
  });
  if (risco) {
    insights.push({
      title: "Risco de desligamento",
      detail: `${risco.name} apresenta sinais de risco (atrasos e/ou ocorrências disciplinares recentes).`,
      tone: "danger",
      action: "Agendar conversa individual (1:1) para entender o contexto antes de uma medida formal.",
    });
  }

  return insights;
}
