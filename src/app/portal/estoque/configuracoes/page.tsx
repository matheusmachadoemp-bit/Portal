import { prisma } from "@/lib/prisma";
import { PageContainer } from "@/components/page-container";
import { ConfiguracoesEstoqueClient } from "./configuracoes-client";
import { auth } from "@/auth";
import { getActiveEmpresaContext, getUserEmpresas } from "@/lib/empresa";

export default async function ConfiguracoesEstoquePage() {
  const session = await auth();
  const ctx = await getActiveEmpresaContext();

  // Só as lojas que o usuário logado pode acessar (`getUserEmpresas` já
  // aplica a regra de acesso total para ADMINISTRADOR/GESTOR e a lista de
  // `UserEmpresaAccess` para os demais perfis). `EmpresaSummary` não traz
  // `metaDivergenciaContagemPercent`, então buscamos os dados completos de
  // configuração numa segunda consulta restrita a esses ids.
  const empresasPermitidas = session?.user ? await getUserEmpresas(session.user.id, session.user.role) : [];
  const empresas = await prisma.empresa.findMany({
    where: { id: { in: empresasPermitidas.map((e) => e.id) } },
    orderBy: { order: "asc" },
    select: { id: true, name: true, metaCmvPercent: true, metaDivergenciaContagemPercent: true },
  });

  return (
    <PageContainer title="Estoque" subtitle="Configurações">
      <div className="space-y-6">
        <ConfiguracoesEstoqueClient
          key={ctx?.mode === "single" ? ctx.empresa.id : "grupo"}
          empresas={empresas}
          activeEmpresaId={ctx?.mode === "single" ? ctx.empresa.id : null}
          canEdit={ctx?.mode === "single"}
        />
      </div>
    </PageContainer>
  );
}
