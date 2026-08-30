import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PageContainer } from "@/components/page-container";
import { ConfiguracoesClient } from "./configuracoes-client";
import { getActiveEmpresaContext } from "@/lib/empresa";

export default async function ConfiguracoesPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const isAdmin = session.user.role === "ADMINISTRADOR" || session.user.role === "GESTOR";
  const ctx = await getActiveEmpresaContext();

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
        taxaIfoodPadrao={ctx?.mode === "single" ? ctx.empresa.taxaIfoodPadrao : null}
        empresaNome={ctx?.mode === "single" ? ctx.empresa.name : null}
        saipos={
          ctx?.mode === "single"
            ? {
                lojaId: ctx.empresa.saiposLojaId,
                syncEnabled: ctx.empresa.saiposSyncEnabled,
                hasToken: !!ctx.empresa.saiposApiToken,
                lastSyncAt: ctx.empresa.saiposLastSyncAt?.toISOString() ?? null,
              }
            : null
        }
        metaAds={
          ctx?.mode === "single"
            ? {
                adAccountId: ctx.empresa.metaAdsAdAccountId,
                adAccountName: ctx.empresa.metaAdsAdAccountName,
                graphVersion: ctx.empresa.metaAdsGraphVersion,
                syncEnabled: ctx.empresa.metaAdsSyncEnabled,
                hasToken: !!ctx.empresa.metaAdsAccessToken,
                lastSyncAt: ctx.empresa.metaAdsLastSyncAt?.toISOString() ?? null,
              }
            : null
        }
        cardapioWeb={
          ctx?.mode === "single"
            ? {
                establishmentId: ctx.empresa.cardapioWebEstablishmentId,
                syncEnabled: ctx.empresa.cardapioWebSyncEnabled,
                hasSecret: !!ctx.empresa.cardapioWebSecret,
                lastSyncAt: ctx.empresa.cardapioWebLastSyncAt?.toISOString() ?? null,
                lastTestAt: ctx.empresa.cardapioWebLastTestAt?.toISOString() ?? null,
                lastTestResult: ctx.empresa.cardapioWebLastTestResult,
              }
            : null
        }
      />
    </PageContainer>
  );
}
