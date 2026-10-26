import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { hasModulePermission } from "@/lib/authz";
import { PageContainer } from "@/components/page-container";
import { requireActiveSingleEmpresa } from "@/lib/empresa";
import { MesasAmbientesClient } from "./mesas-ambientes-client";

/**
 * Mesas e Ambientes (Etapa 2 do módulo Reservas) — CRUD funcional de Ambientes e Mesas, mais o
 * cadastro de combinações pré-aprovadas de mesas (ver comentário de modelagem no
 * `prisma/schema.prisma` acima de `model ReservationEnvironment`). Sem mapa visual do salão de
 * propósito (ver prompt da tarefa "reservas-etapa2") — só listas/formulários, mesmo nível de
 * acabamento da tela de Configurações da Etapa 1. Só um shell de servidor: a lista em si vem das
 * rotas `/api/reservas/{ambientes,mesas,combinacoes}`, consumidas pelo client component abaixo.
 */
export default async function ReservasMesasAmbientesPage() {
  const session = await auth();
  if (!session?.user || !(await hasModulePermission(session.user.id, "reservas", "canView"))) {
    redirect("/portal/inicio");
  }

  const [canCreate, canEdit, canDelete, empresa] = await Promise.all([
    hasModulePermission(session.user.id, "reservas", "canCreate"),
    hasModulePermission(session.user.id, "reservas", "canEdit"),
    hasModulePermission(session.user.id, "reservas", "canDelete"),
    requireActiveSingleEmpresa(),
  ]);

  return (
    <PageContainer title="Reservas" subtitle="Mesas e Ambientes" backHref="/portal/reservas" backLabel="Reservas">
      <MesasAmbientesClient canCreate={canCreate} canEdit={canEdit} canDelete={canDelete} hasEmpresa={!!empresa} />
    </PageContainer>
  );
}
