import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { PageContainer } from "@/components/page-container";
import { SenhasClient } from "./senhas-client";

// Mesma checagem de cargo (não de perfil) usada pela API irmã
// (`src/app/api/admin/vault/route.ts`): o Cofre de senhas é sensível demais para depender
// só do Perfil de Permissão (módulo "administrativo", que também cobre cursos/cartilhas/logo/
// arquivos — bem mais amplo e liberado por padrão para praticamente todo mundo). Fica restrito
// a ADMINISTRADOR/GESTOR por cargo, igual a API.
const VAULT_ROLES = ["ADMINISTRADOR", "GESTOR"];

export default async function SenhasPage() {
  const session = await auth();
  if (!session?.user || !VAULT_ROLES.includes(session.user.role)) {
    redirect("/portal/inicio");
  }

  const entries = await prisma.vaultEntry.findMany({
    orderBy: { systemName: "asc" },
    include: { createdBy: { select: { name: true } } },
  });

  const serialized = entries.map((e) => ({
    id: e.id,
    systemName: e.systemName,
    site: e.site,
    username: e.username,
    category: e.category,
    responsavel: e.responsavel,
    observacao: e.observacao,
    updatedAt: e.updatedAt.toISOString(),
    createdBy: e.createdBy.name,
  }));

  return (
    <PageContainer title="Administrativo" subtitle="Cofre de senhas — acesso restrito e criptografado">
      <div className="space-y-6">
        <SenhasClient initialEntries={serialized} />
      </div>
    </PageContainer>
  );
}
