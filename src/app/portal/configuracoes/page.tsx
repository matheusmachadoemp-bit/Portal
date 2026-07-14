import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PageContainer } from "@/components/page-container";
import { ConfiguracoesClient } from "./configuracoes-client";

export default async function ConfiguracoesPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const isAdmin = session.user.role === "ADMINISTRADOR" || session.user.role === "GESTOR";

  const auditLogs = isAdmin
    ? await prisma.auditLog.findMany({
        orderBy: { createdAt: "desc" },
        take: 30,
        include: { user: { select: { name: true } } },
      })
    : [];

  const serializedLogs = auditLogs.map((l) => ({
    id: l.id,
    action: l.action,
    entityType: l.entityType,
    entityId: l.entityId,
    createdAt: l.createdAt.toISOString(),
    userName: l.user?.name ?? "Sistema",
  }));

  return (
    <PageContainer title="Configurações" subtitle="Conta, integrações e auditoria">
      <ConfiguracoesClient
        userName={session.user.name ?? ""}
        userEmail={session.user.email ?? ""}
        userRole={session.user.role}
        isAdmin={isAdmin}
        auditLogs={serializedLogs}
      />
    </PageContainer>
  );
}
