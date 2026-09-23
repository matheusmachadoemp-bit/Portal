import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { hasModulePermission } from "@/lib/authz";
import { PageContainer } from "@/components/page-container";
import { OcorrenciasClient } from "./ocorrencias-client";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";
import { computeOccurrenceCounts, computeOccurrenceRanking } from "@/lib/rh-server";

// Mesma checagem de cargo (MANAGER_ROLES) já usada pela rota de API irmã (`/api/rh/occurrences`,
// desde o commit f109b8e) — sem ela, qualquer COLABORADOR com o Perfil de Permissão padrão
// "Funcionário" (rh:canView=true de fábrica) conseguia ver todas as ocorrências disciplinares de
// todos os colegas direto nesta página Server Component (BUG-004). Fica restrito a
// Administrador/Gestor/Gerente/Supervisor por cargo, igual à API.
const MANAGER_ROLES = ["ADMINISTRADOR", "GESTOR", "GERENTE", "SUPERVISOR"];

export default async function OcorrenciasPage() {
  const session = await auth();
  if (!session?.user || !MANAGER_ROLES.includes(session.user.role)) {
    redirect("/portal/inicio");
  }
  if (!(await hasModulePermission(session.user.id, "rh", "canView"))) {
    redirect("/portal/inicio");
  }

  const ctx = await getActiveEmpresaContext();
  const empresaIds = ctx ? empresaIdsForContext(ctx) : [];
  const canManageRh = await hasModulePermission(session.user.id, "rh", "canCreate");
  const canCreate = ctx?.mode === "single" && canManageRh;

  // Task #309 (mesma classe do #282/#287, ver conta completa de colaboradores/loja em
  // ../financeiro/page.tsx): este findMany carregava as ocorrências de TODOS os colaboradores da
  // loja/Grupo Nord sem `take` nenhum. Ocorrências são eventos raros (falta/atraso/advertência/
  // suspensão etc.), então crescem mais devagar por colaborador que Financeiro — mas ainda
  // multiplicam pelo número de colaboradores "históricos" (~120/loja × ~8 lojas ≈ 960 no Grupo
  // Nord, mesma estimativa de ../financeiro/page.tsx). Teto sobe pra 1000 (~3,3x o individual da
  // ficha, OCCURRENCES_SAFETY_TAKE=300 — mesma proporção usada no teto de Financeiro). `orderBy`
  // desc garante que o corte mantém sempre as ocorrências mais recentes.
  //
  // `/api/rh/occurrences` (chamada pelo refresh()) recebe o mesmo ajuste, pra manter SSR e refresh
  // consistentes — ver comentário lá.
  const OCCURRENCES_STORE_SAFETY_TAKE = 1000;

  // Task #309 revisão (Teulis): os StatCards ("Faltas", "Atrasos" etc.) e o "Ranking de atrasos"/
  // "Ranking de faltas" NÃO podem vir da lista `occurrences` abaixo — ela tem `take`, e contar/
  // agrupar uma lista cortada dá um número ERRADO (silenciosamente menor que o real, e pode até
  // esconder um colaborador inteiro do ranking) assim que o histórico da loja passa do teto.
  // `computeOccurrenceCounts`/`computeOccurrenceRanking` (ver src/lib/rh-server.ts pro racional
  // completo) calculam isso via agregação no banco, sem `take` nenhum.
  const occurrenceWhere = { employee: { empresaId: { in: empresaIds } } };
  const [occurrences, employees, counts, ranking] = await Promise.all([
    prisma.occurrence.findMany({
      where: occurrenceWhere,
      orderBy: { date: "desc" },
      take: OCCURRENCES_STORE_SAFETY_TAKE,
      include: {
        employee: { select: { id: true, name: true, setor: true } },
        createdBy: { select: { name: true } },
      },
    }),
    prisma.employee.findMany({ where: { empresaId: { in: empresaIds } }, orderBy: { name: "asc" } }),
    computeOccurrenceCounts(occurrenceWhere),
    computeOccurrenceRanking(occurrenceWhere),
  ]);

  const serialized = occurrences.map((o) => ({
    ...o,
    date: o.date.toISOString(),
    prazo: o.prazo ? o.prazo.toISOString() : null,
    createdAt: o.createdAt.toISOString(),
  }));

  return (
    <PageContainer title="RH" subtitle="Ocorrências disciplinares e da rotina">
      <OcorrenciasClient
        initialOccurrences={serialized}
        initialCounts={counts}
        initialRanking={ranking}
        employees={employees.map((e) => ({ id: e.id, name: e.name, setor: e.setor }))}
        canCreate={canCreate}
        isGrupoNordMode={ctx?.mode !== "single"}
      />
    </PageContainer>
  );
}
