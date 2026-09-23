import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { hasModulePermission } from "@/lib/authz";
import { PageContainer } from "@/components/page-container";
import { UniformesClient } from "./uniformes-client";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";

// Mesma checagem de cargo (MANAGER_ROLES) já usada nas rotas de API irmãs de RH (desde o commit
// f109b8e) — sem ela, qualquer COLABORADOR com o Perfil de Permissão padrão "Funcionário"
// (rh:canView=true de fábrica) conseguia ver as entregas de uniforme de todos os colegas direto
// nesta página Server Component (BUG-004). Fica restrito a Administrador/Gestor/Gerente/Supervisor
// por cargo, igual ao resto do módulo RH.
const MANAGER_ROLES = ["ADMINISTRADOR", "GESTOR", "GERENTE", "SUPERVISOR"];

export default async function UniformesPage() {
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

  // Task #309 (avaliado e decidido NÃO colocar `take` aqui — mesma decisão já tomada por
  // colaborador em #287, ver conta completa de colaboradores/loja em ../financeiro/page.tsx):
  // entregas de uniforme são poucas por colaborador (~1-3/ano: uniforme novo, reposição por
  // desgaste/troca de tamanho). Conta (mesma base ~120 colaboradores "históricos"/loja × ~8 lojas
  // ≈ 960 no Grupo Nord): ~5 entregas por colaborador ao longo do vínculo (~3 anos médios) ≈ 600
  // registros/loja acumulados em TODA a história da loja ≈ 4800 no Grupo Nord consolidado — ainda
  // bem abaixo de 1 único mês de crescimento de Financeiro (≈2200/mês), então continua um SELECT
  // indexado (`@@index([empresaId, dataEntrega])`) rápido sem `take`. Os cards de "Entregas/Trocas/
  // Devoluções/Perdas" (ver `totals` em uniformes-client.tsx) também contam o array inteiro por
  // status — cortar aqui arriscaria distorcer essas contagens sem ganho de performance real.
  const [deliveries, employees] = await Promise.all([
    prisma.uniformDelivery.findMany({
      where: { empresaId: { in: empresaIds } },
      orderBy: { dataEntrega: "desc" },
      include: { employee: { select: { name: true, setor: true } } },
    }),
    prisma.employee.findMany({
      where: { empresaId: { in: empresaIds } },
      orderBy: { name: "asc" },
      select: { id: true, name: true, setor: true },
    }),
  ]);

  const serialized = deliveries.map((d) => ({ ...d, dataEntrega: d.dataEntrega.toISOString() }));

  return (
    <PageContainer title="RH" subtitle="Uniformes">
      <UniformesClient
        initialDeliveries={serialized}
        employees={employees}
        canCreate={canCreate}
        isGrupoNordMode={ctx?.mode !== "single"}
      />
    </PageContainer>
  );
}
