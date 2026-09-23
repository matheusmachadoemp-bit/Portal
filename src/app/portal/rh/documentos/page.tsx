import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { hasModulePermission } from "@/lib/authz";
import { PageContainer } from "@/components/page-container";
import { DocumentosClient } from "./documentos-client";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";

// Mesma checagem de cargo (MANAGER_ROLES) já usada pela rota de API irmã (`/api/rh/documents`,
// desde o commit f109b8e) — sem ela, qualquer COLABORADOR com o Perfil de Permissão padrão
// "Funcionário" (rh:canView=true de fábrica) conseguia ver todos os documentos (inclusive
// `fileUrl`, o arquivo do contrato/documento enviado) de todos os colegas direto nesta página
// Server Component (BUG-004). Fica restrito a Administrador/Gestor/Gerente/Supervisor por cargo,
// igual à API.
const MANAGER_ROLES = ["ADMINISTRADOR", "GESTOR", "GERENTE", "SUPERVISOR"];

export default async function DocumentosPage() {
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
  // documentos por colaborador também são poucos (RG, CPF, contrato, exames admissionais/
  // periódicos, certificados — ~5-15 ao longo do vínculo). Conta (mesma base ~120 colaboradores
  // "históricos"/loja × ~8 lojas ≈ 960 no Grupo Nord): uso ~10/colaborador ≈ 1200 registros/loja
  // acumulados em TODA a história da loja ≈ 9600 no Grupo Nord consolidado — esta é a MAIS PRÓXIMA
  // das 3 sem `take` de virar um volume grande (quase metade de 1 mês de crescimento do Financeiro,
  // que é ≈2200/mês, mas acumulada na história INTEIRA da rede, não por mês), então ainda é um
  // SELECT indexado (`@@index([empresaId, createdAt])`) administrável, mas se o Grupo Nord crescer
  // bem além de ~8 lojas ativas isso merece reavaliação. Nenhum campo é um blob — `fileUrl` é só a
  // URL do arquivo no Vercel Blob, não o arquivo em si — então o custo por linha continua baixo.
  const [documents, employees] = await Promise.all([
    prisma.employeeDocument.findMany({
      where: { empresaId: { in: empresaIds } },
      orderBy: { createdAt: "desc" },
      include: { employee: { select: { name: true, setor: true } } },
    }),
    prisma.employee.findMany({
      where: { empresaId: { in: empresaIds } },
      orderBy: { name: "asc" },
      select: { id: true, name: true, setor: true },
    }),
  ]);

  const serialized = documents.map((d) => ({
    ...d,
    validade: d.validade ? d.validade.toISOString() : null,
    createdAt: d.createdAt.toISOString(),
  }));

  return (
    <PageContainer title="RH" subtitle="Documentos">
      <DocumentosClient
        initialDocuments={serialized}
        employees={employees}
        canCreate={canCreate}
        isGrupoNordMode={ctx?.mode !== "single"}
      />
    </PageContainer>
  );
}
