import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { hasModulePermission } from "@/lib/authz";
import { PageContainer } from "@/components/page-container";
import { FeriasClient } from "./ferias-client";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";

// Mesma checagem de cargo (MANAGER_ROLES) já usada pela rota de API irmã (`/api/rh/vacations`,
// desde o commit f109b8e) — sem ela, qualquer COLABORADOR com o Perfil de Permissão padrão
// "Funcionário" (rh:canView=true de fábrica) conseguia ver as férias de todos os colegas direto
// nesta página Server Component (BUG-004). Fica restrito a Administrador/Gestor/Gerente/Supervisor
// por cargo, igual à API.
const MANAGER_ROLES = ["ADMINISTRADOR", "GESTOR", "GERENTE", "SUPERVISOR"];

export default async function FeriasPage() {
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

  // Task #309 (avaliado e decidido NÃO colocar `take` aqui, ao contrário de ../financeiro/page.tsx
  // e ../ocorrencias/page.tsx — mesma decisão já tomada por colaborador em #287): Férias cresce
  // devagar por natureza, ~1 período aquisitivo por ano por colaborador ATIVO. Conta (mesma base de
  // ~120 colaboradores "históricos" por loja × ~8 lojas ≈ 960 no Grupo Nord, ver estimativa
  // completa em ../financeiro/page.tsx): cada colaborador fica em média ~3 anos de casa (turnover
  // assumido), gerando ~3 registros de férias ao longo do vínculo ≈ 360 registros/loja acumulados
  // em TODA a história da loja (não por mês, diferente de Financeiro) — no Grupo Nord consolidado,
  // ≈ 2900 registros acumulados na história inteira da rede. Isso é ~1 mês de crescimento de
  // Financeiro (≈2200/mês), então mesmo no pior caso continua um SELECT indexado
  // (`@@index([empresaId, periodoAquisitivoInicio])`) rápido e administrável sem `take`.
  //
  // Além disso, o card de "Dias disponíveis"/"Férias a vencer" (ver `totals` em
  // ferias-client.tsx) soma o array `visible` inteiro — cortar aqui arriscaria descontar dado real
  // (dias de férias de colaboradores mais antigos) sem ganho de performance que justifique.
  const [vacations, employees] = await Promise.all([
    prisma.vacation.findMany({
      where: { empresaId: { in: empresaIds } },
      orderBy: { periodoAquisitivoInicio: "desc" },
      include: { employee: { select: { name: true, setor: true } } },
    }),
    prisma.employee.findMany({
      where: { empresaId: { in: empresaIds } },
      orderBy: { name: "asc" },
      select: { id: true, name: true, setor: true },
    }),
  ]);

  const serialized = vacations.map((v) => ({
    ...v,
    periodoAquisitivoInicio: v.periodoAquisitivoInicio.toISOString(),
    periodoAquisitivoFim: v.periodoAquisitivoFim.toISOString(),
    dataInicio: v.dataInicio ? v.dataInicio.toISOString() : null,
    dataFim: v.dataFim ? v.dataFim.toISOString() : null,
  }));

  return (
    <PageContainer title="RH" subtitle="Férias">
      <FeriasClient
        initialVacations={serialized}
        employees={employees}
        canCreate={canCreate}
        isGrupoNordMode={ctx?.mode !== "single"}
      />
    </PageContainer>
  );
}
