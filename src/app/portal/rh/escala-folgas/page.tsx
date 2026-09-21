import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { hasModulePermission } from "@/lib/authz";
import { PageContainer } from "@/components/page-container";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";
import { resolveOwnSetor } from "@/lib/escala-folgas-server";
import { EscalaFolgasClient } from "./escala-folgas-client";

/**
 * Escala de Folgas (RH) — Fase 2a: calendário mensal, só leitura. Resolve permissão/contexto aqui
 * (Server Component) e devolve pro client só o necessário pra montar os filtros — os dados do
 * calendário em si (`getCalendarioDias`) são buscados pelo client direto em
 * `GET /api/rh/escala-folgas/calendario`, que já é a única fonte da verdade pra essa restrição
 * (evita duplicar aqui a regra "Líder só vê o próprio setor" que a rota já aplica).
 */
export default async function EscalaFolgasPage() {
  const session = await auth();
  if (!session?.user || !(await hasModulePermission(session.user.id, "rh", "canView"))) {
    redirect("/portal/inicio");
  }

  const ctx = await getActiveEmpresaContext();
  const empresaIds = ctx ? empresaIdsForContext(ctx) : [];
  const isSupervisor = session.user.role === "SUPERVISOR";

  // Líder (SUPERVISOR): a API já restringe ao próprio setor de qualquer forma, então o filtro de
  // setor não tem utilidade nenhuma pra esse perfil — nem vale a pena buscar o catálogo completo.
  // Os demais perfis com acesso ao RH (Gerente/Gestor/Administrador) veem e filtram por qualquer
  // setor da(s) loja(s) ativa(s).
  let ownSetor: string | null = null;
  let setores: string[] = [];
  if (isSupervisor) {
    ownSetor = await resolveOwnSetor(session.user.id);
  } else {
    const rows = await prisma.employee.findMany({
      where: { empresaId: { in: empresaIds } },
      select: { setor: true },
      distinct: ["setor"],
      orderBy: { setor: "asc" },
    });
    setores = rows.map((r) => r.setor).filter((s) => s.trim().length > 0);
  }

  return (
    <PageContainer title="RH" subtitle="Escala de Folgas">
      <EscalaFolgasClient
        isSupervisor={isSupervisor}
        ownSetor={ownSetor}
        setores={setores}
        isGrupoNordMode={ctx?.mode !== "single"}
      />
    </PageContainer>
  );
}
