import { prisma } from "@/lib/prisma";
import { PageContainer } from "@/components/page-container";
import { ConfiguracoesEstoqueClient } from "./configuracoes-client";
import { getActiveEmpresaContext } from "@/lib/empresa";

export default async function ConfiguracoesEstoquePage() {
  const ctx = await getActiveEmpresaContext();
  const empresas = await prisma.empresa.findMany({ where: { active: true }, orderBy: { order: "asc" } });

  return (
    <PageContainer title="Estoque" subtitle="Configurações">
      <div className="space-y-6">
        <ConfiguracoesEstoqueClient
          empresas={empresas.map((e) => ({ id: e.id, name: e.name, metaCmvPercent: e.metaCmvPercent, metaDivergenciaContagemPercent: e.metaDivergenciaContagemPercent }))}
          activeEmpresaId={ctx?.mode === "single" ? ctx.empresa.id : null}
          canEdit={ctx?.mode === "single"}
        />
      </div>
    </PageContainer>
  );
}
