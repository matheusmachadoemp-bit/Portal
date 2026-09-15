import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PageContainer } from "@/components/page-container";
import { ConfiguracoesNotificacaoClient } from "./configuracoes-notificacao-client";
import { requireActiveSingleEmpresa } from "@/lib/empresa";
import { auth } from "@/auth";
import { hasModulePermission } from "@/lib/authz";
import { getStoreActiveUsers } from "@/lib/manutencao-server";
import type { NotificacaoUserOption } from "../types";

export default async function ConfiguracoesManutencaoPage() {
  const session = await auth();
  if (!session?.user || !(await hasModulePermission(session.user.id, "manutencao", "canView"))) {
    redirect("/portal/inicio");
  }

  const canEdit = await hasModulePermission(session.user.id, "manutencao", "canEdit");

  // Configuração de notificação é sempre por loja específica — no modo "Grupo
  // Nord" consolidado (mais de uma loja ao mesmo tempo) não há uma única
  // lista de destinatários pra mostrar/editar, então `empresa` vem null e a
  // tela mostra um aviso pedindo pra selecionar uma loja (mesma regra da rota
  // `/api/manutencao/configuracoes/notificacoes`, que rejeita esse modo).
  const empresa = await requireActiveSingleEmpresa();

  let users: NotificacaoUserOption[] = [];
  let configuredUserIds: string[] = [];

  if (empresa) {
    const [storeUsers, destinatarios] = await Promise.all([
      getStoreActiveUsers(empresa.id),
      prisma.manutencaoNotificacaoDestinatario.findMany({
        where: { empresaId: empresa.id },
        select: { userId: true },
      }),
    ]);
    users = storeUsers;
    configuredUserIds = destinatarios.map((d) => d.userId);
  }

  return (
    <PageContainer title="Manutenção" subtitle="Configurações" backHref="/portal/manutencao" backLabel="Manutenção">
      <ConfiguracoesNotificacaoClient
        key={empresa?.id ?? "grupo"}
        empresaName={empresa?.name ?? null}
        users={users}
        initialConfiguredUserIds={configuredUserIds}
        canEdit={canEdit}
      />
    </PageContainer>
  );
}
