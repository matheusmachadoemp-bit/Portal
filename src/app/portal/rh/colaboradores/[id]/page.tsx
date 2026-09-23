import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { hasModulePermission } from "@/lib/authz";
import { PageContainer } from "@/components/page-container";
import { AccessDenied } from "@/components/ui/access-denied";
import { EmployeeProfileClient } from "./employee-profile-client";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";
import { notFound, redirect } from "next/navigation";
import { computeTimeEntryTotals, computeTimeEntryMonthlyChart } from "@/lib/ponto-eletronico-server";
import { resolveRollingPeriod } from "@/lib/periods";
import { computeFinanceMonthlyChart, computeFinanceTotals, computeOccurrenceCounts } from "@/lib/rh-server";

// Mesma checagem de cargo (MANAGER_ROLES) já usada pela página-lista irmã (`../page.tsx`, BUG-004)
// e por todas as demais páginas do módulo RH — sem ela, qualquer COLABORADOR com o Perfil de
// Permissão padrão "Funcionário" (rh:canView=true de fábrica) conseguia abrir a ficha de QUALQUER
// colega sabendo o `id` (a query abaixo só filtra por empresaId, nunca por cargo) e ver CPF, chave
// PIX, salário fixo e nota da última avaliação de desempenho, além de ter acesso às abas de
// Financeiro, Ponto Eletrônico, Ocorrências, Férias, Uniformes e Documentos (RG/contrato, via URL
// pública do Vercel Blob) daquele colega — achado CRÍTICO de auditoria (Jonas). Fica restrito a
// Administrador/Gestor/Gerente/Supervisor por cargo, igual ao resto do RH.
const MANAGER_ROLES = ["ADMINISTRADOR", "GESTOR", "GERENTE", "SUPERVISOR"];

export default async function EmployeeProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) {
    redirect("/portal/inicio");
  }
  if (!MANAGER_ROLES.includes(session.user.role)) {
    return (
      <PageContainer title="RH" subtitle="Ficha do colaborador" backHref="/portal/rh/colaboradores" backLabel="Colaboradores">
        <AccessDenied message="Esta página reúne dados sensíveis do colaborador (CPF, chave PIX, salário, avaliações de desempenho) e por isso é restrita a Administrador, Gestor, Gerente ou Supervisor. Se você precisa desse acesso, fale com seu gestor." />
      </PageContainer>
    );
  }
  if (!(await hasModulePermission(session.user.id, "rh", "canView"))) {
    redirect("/portal/inicio");
  }

  const { id } = await params;
  const ctx = await getActiveEmpresaContext();
  const empresaIds = ctx ? empresaIdsForContext(ctx) : [];
  const canManageRh = await hasModulePermission(session.user.id, "rh", "canCreate");
  const canCreate = ctx?.mode === "single" && canManageRh;

  const employee = await prisma.employee.findFirst({
    where: { id, empresaId: { in: empresaIds } },
    include: { empresa: { select: { name: true } } },
  });
  if (!employee) notFound();

  const employeeRef = { select: { id: true, name: true, setor: true } } as const;

  // Task #287 (mesma classe do #282, já corrigido em ../ponto-eletronico/page.tsx): estes 6 findMany
  // não tinham nenhum `take`, carregando o histórico COMPLETO de cada aba de uma vez só. Diferente
  // do #282 (company-wide, todas as lojas/colaboradores juntos), aqui cada query já é filtrada por
  // `employeeId: id` — cresce bem mais devagar (um funcionário só), mas sem teto nenhum ainda é um
  // risco de longo prazo nos três históricos que crescem ao longo da carreira do colaborador:
  // Financeiro (lançamentos recorrentes: salário, VT, VA, comissão, bonificação, desconto), Ponto
  // Eletrônico (~1 registro/dia) e Ocorrências.
  //
  // Férias, Uniformes e Documentos ficam DE PROPÓSITO sem `take`: crescem devagar por natureza (~1
  // período aquisitivo por ano, poucas entregas de uniforme/documentos por colaborador — mesmo
  // alguém com décadas de casa dificilmente passa de algumas dezenas de registros), não existe teto
  // equivalente em nenhuma rota irmã pra replicar aqui, e os cards de "Resumo" (dias de férias
  // disponíveis, férias a vencer) somam o array de férias inteiro — cortar aqui arriscaria descontar
  // dado real sem ganho de performance que justifique.
  //
  // Os tetos abaixo replicam os já usados nas rotas/páginas irmãs, pra manter o mesmo volume entre a
  // carga inicial (SSR) e o refresh() que cada client component (Financeiro/Ponto
  // Eletrônico/Ocorrências) dispara depois de qualquer criação/edição/exclusão:
  // - Ponto Eletrônico: mesmo TIME_ENTRIES_SAFETY_TAKE=2000 de ../ponto-eletronico/page.tsx (#282) e
  //   de /api/rh/time-entries (#373) — aqui é 1 colaborador só, então na prática nunca deve nem
  //   chegar perto do teto.
  // - Ocorrências: mesmo take:300 já usado em /api/rh/occurrences (rota chamada pelo refresh()).
  // - Financeiro: não existe teto irmão pra replicar — /api/rh/finance nunca teve `take` (achado
  //   incidental, fora do escopo desta task, ver relatório). Usamos o mesmo 2000 do Ponto Eletrônico
  //   por ser a mesma categoria "cresce com o tempo": bem acima do volume real esperado mesmo pra
  //   quem está há muitos anos na empresa, então funciona como teto de segurança sem cortar dado de
  //   verdade no uso normal.
  const TIME_ENTRIES_SAFETY_TAKE = 2000;
  const FINANCE_ENTRIES_SAFETY_TAKE = 2000;
  const OCCURRENCES_SAFETY_TAKE = 300;

  // Task #309 revisão (Teulis): os StatCards de Financeiro ("Total recebido" etc.) e Ocorrências
  // ("Faltas"/"Atrasos" etc.) na ficha do colaborador têm o MESMO problema apontado nas páginas
  // standalone (ver ../../financeiro/page.tsx e ../../ocorrencias/page.tsx pro racional completo):
  // não podem vir de somar/contar `financeEntries`/`occurrences` acima, porque essas listas têm
  // `take`. Aqui o risco prático é bem menor (é 1 colaborador só, dificilmente passa do teto — ver
  // conta em ../../financeiro/page.tsx), mas o mecanismo do bug é idêntico, e agora que
  // `computeFinanceTotals`/`computeFinanceMonthlyChart`/`computeOccurrenceCounts` já existem (ver
  // src/lib/rh-server.ts) não custa nada aplicar aqui também, pra ficha e standalone sempre
  // concordarem no mesmo número. `ranking` não é calculado aqui: a ficha esconde as seções de
  // ranking quando `fixedEmployeeId` está setado (não faz sentido ranquear 1 pessoa só).
  const financeWhere = { employeeId: id };
  const occurrenceWhere = { employeeId: id };

  // Task #316 (mesma classe do #282/#287, já corrigido para a lista em si): os StatCards de Ponto
  // Eletrônico ("Horas trabalhadas"/"Atrasos"/"Faltas"/"Banco de horas") e os gráficos "por mês" da
  // aba "Ponto Eletrônico" desta ficha têm o MESMO problema apontado em ../ponto-eletronico/page.tsx
  // (ver racional completo em src/lib/ponto-eletronico-server.ts): não podem vir de somar/contar
  // `timeEntries` abaixo, porque essa lista tem `take`. Aqui o risco prático é bem menor (1
  // colaborador só, dificilmente passa de 2000 registros de ponto), mas o mecanismo do bug é
  // idêntico, e a ficha e a tela standalone precisam sempre concordar no mesmo número.
  const initialRange = resolveRollingPeriod("mes-atual");
  const timeEntryWhere = { employeeId: id, date: { gte: initialRange.from, lte: initialRange.to } };

  const [
    financeEntries,
    timeEntries,
    occurrences,
    vacations,
    uniformDeliveries,
    documents,
    financeTotals,
    financeChartData,
    occurrenceCounts,
    timeEntryTotals,
    timeEntryChartData,
  ] = await Promise.all([
    prisma.employeeFinanceEntry.findMany({
      where: financeWhere,
      orderBy: { date: "desc" },
      include: { employee: employeeRef },
      take: FINANCE_ENTRIES_SAFETY_TAKE,
    }),
    prisma.timeEntry.findMany({
      where: { employeeId: id },
      orderBy: { date: "desc" },
      include: { employee: employeeRef },
      take: TIME_ENTRIES_SAFETY_TAKE,
    }),
    prisma.occurrence.findMany({
      where: occurrenceWhere,
      orderBy: { date: "desc" },
      include: { createdBy: { select: { name: true } }, employee: employeeRef },
      take: OCCURRENCES_SAFETY_TAKE,
    }),
    prisma.vacation.findMany({ where: { employeeId: id }, orderBy: { periodoAquisitivoInicio: "desc" }, include: { employee: employeeRef } }),
    prisma.uniformDelivery.findMany({ where: { employeeId: id }, orderBy: { dataEntrega: "desc" }, include: { employee: employeeRef } }),
    prisma.employeeDocument.findMany({ where: { employeeId: id }, orderBy: { createdAt: "desc" }, include: { employee: employeeRef } }),
    computeFinanceTotals(financeWhere),
    computeFinanceMonthlyChart([employee.empresaId], id),
    computeOccurrenceCounts(occurrenceWhere),
    computeTimeEntryTotals(timeEntryWhere),
    computeTimeEntryMonthlyChart([employee.empresaId], id),
  ]);

  const employeeDTO = {
    ...employee,
    admissionDate: employee.admissionDate.toISOString(),
    terminationDate: employee.terminationDate ? employee.terminationDate.toISOString() : null,
    birthDate: employee.birthDate ? employee.birthDate.toISOString() : null,
    lastEvaluationDate: employee.lastEvaluationDate ? employee.lastEvaluationDate.toISOString() : null,
    lastTrainingDate: employee.lastTrainingDate ? employee.lastTrainingDate.toISOString() : null,
  };

  return (
    <PageContainer title="RH" subtitle="Ficha do colaborador" backHref="/portal/rh/colaboradores" backLabel="Colaboradores">
      <EmployeeProfileClient
        employee={employeeDTO}
        financeEntries={financeEntries.map((f) => ({ ...f, date: f.date.toISOString() }))}
        timeEntries={timeEntries.map((t) => ({ ...t, date: t.date.toISOString() }))}
        occurrences={occurrences.map((o) => ({
          ...o,
          date: o.date.toISOString(),
          prazo: o.prazo ? o.prazo.toISOString() : null,
        }))}
        vacations={vacations.map((v) => ({
          ...v,
          periodoAquisitivoInicio: v.periodoAquisitivoInicio.toISOString(),
          periodoAquisitivoFim: v.periodoAquisitivoFim.toISOString(),
          dataInicio: v.dataInicio ? v.dataInicio.toISOString() : null,
          dataFim: v.dataFim ? v.dataFim.toISOString() : null,
        }))}
        uniformDeliveries={uniformDeliveries.map((u) => ({ ...u, dataEntrega: u.dataEntrega.toISOString() }))}
        documents={documents.map((d) => ({ ...d, validade: d.validade ? d.validade.toISOString() : null }))}
        financeTotals={financeTotals}
        financeChartData={financeChartData}
        occurrenceCounts={occurrenceCounts}
        timeEntryTotals={timeEntryTotals}
        timeEntryChartData={timeEntryChartData}
        canCreate={canCreate}
        isGrupoNordMode={ctx?.mode !== "single"}
      />
    </PageContainer>
  );
}
