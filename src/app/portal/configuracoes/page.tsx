import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { hasModulePermission } from "@/lib/authz";
import { PageContainer } from "@/components/page-container";
import { ConfiguracoesClient } from "./configuracoes-client";
import { empresaIdsForContext, getActiveEmpresaContext, getUserEmpresas } from "@/lib/empresa";

export default async function ConfiguracoesPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  // "Minha conta" (nome/e-mail/cargo + trocar a própria senha, logo abaixo) é
  // autoatendimento — igual usuarios/me e usuarios/me/senha — e continua
  // liberado pra qualquer usuário logado, independente de perfil. Só a parte
  // administrativa da tela (auditoria + integrações iFood/Saipos/Meta Ads,
  // incluindo os campos hasToken/syncEnabled apontados pelo Nelson) depende de
  // canView em "configuracoes", em conjunto com a checagem de cargo que já
  // existia: perfil pode restringir além do cargo, nunca liberar além dele.
  const isAdmin =
    (session.user.role === "ADMINISTRADOR" || session.user.role === "GESTOR") &&
    (await hasModulePermission(session.user.id, "configuracoes", "canView"));
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

  // "Metas de CMV por loja" — mudou pra cá (categoria global "Configurações") vindo de duas
  // telas que foram embora/perderam a edição: Estoque → Configurações (tela inteira removida,
  // ver prisma/migrations/20260930140000_remove_configuracoes_subcategoria_estoque) e CMV →
  // Comparativo Real x Teórico (manteve só a visualização). `getUserEmpresas` já traz
  // `metaCmvPercent` no seu select "de vitrine" (`EmpresaSummary`), então não precisa de uma
  // consulta própria — só filtramos pra ninguém que não seja admin pagar o custo da query à toa.
  const metasCmv = isAdmin ? await getUserEmpresas(session.user.id, session.user.role) : [];
  const canEditMetaCmv = ctx?.mode === "single" && (await hasModulePermission(session.user.id, "configuracoes", "canEdit"));

  // "Notificações de checklist" — pedido do Matheus: poder ajustar, sem depender de um agente
  // mexer no código, os limiares de cobrança automática de cada checklist (já existentes em
  // ChecklistTemplate.cobrancaAtiva/avisoAntesMinutos/avisoAtrasoResponsavelMinutos/
  // alertaCriticoMinutos/naoRealizadoMinutos, lidos por processChecklistEscalations em
  // src/lib/checklist-server.ts) sem precisar entrar em cada checklist individualmente. Lista
  // TODOS os checklists visíveis no contexto de loja atual — uma loja só, ou todas no modo Grupo
  // Nord (`empresaIdsForContext`), igual `GET /api/checklist/templates` já faz hoje. Diferente de
  // "Metas de CMV por loja" (editável só com uma loja específica ativa): aqui a edição é por
  // checklist (cada linha já carrega sua própria empresaId, ver
  // src/app/api/configuracoes/checklist-notificacoes/[id]/route.ts), então não precisa restringir
  // a edição ao modo loja única.
  const checklistTemplates = isAdmin
    ? await prisma.checklistTemplate.findMany({
        where: { empresaId: { in: ctx ? empresaIdsForContext(ctx) : [] } },
        select: {
          id: true,
          name: true,
          setor: true,
          categoria: true,
          turno: true,
          cobrancaAtiva: true,
          avisoAntesMinutos: true,
          avisoAtrasoResponsavelMinutos: true,
          alertaCriticoMinutos: true,
          naoRealizadoMinutos: true,
          empresa: { select: { name: true } },
        },
        orderBy: [{ empresa: { name: "asc" } }, { name: "asc" }],
      })
    : [];
  const canEditChecklistNotificacoes = isAdmin && (await hasModulePermission(session.user.id, "configuracoes", "canEdit"));

  return (
    <PageContainer title="Configurações" subtitle="Conta, integrações e auditoria">
      <ConfiguracoesClient
        key={ctx?.mode === "single" ? ctx.empresa.id : "grupo"}
        userName={session.user.name ?? ""}
        userEmail={session.user.email ?? ""}
        userRole={session.user.role}
        isAdmin={isAdmin}
        auditLogs={serializedLogs}
        taxaIfoodPadrao={isAdmin && ctx?.mode === "single" ? ctx.empresa.taxaIfoodPadrao : null}
        empresaNome={isAdmin && ctx?.mode === "single" ? ctx.empresa.name : null}
        metasCmv={metasCmv.map((e) => ({ id: e.id, name: e.name, metaCmvPercent: e.metaCmvPercent }))}
        activeEmpresaId={ctx?.mode === "single" ? ctx.empresa.id : null}
        canEditMetaCmv={canEditMetaCmv}
        checklistTemplates={checklistTemplates.map((t) => ({
          id: t.id,
          name: t.name,
          empresaNome: t.empresa.name,
          setor: t.setor,
          categoria: t.categoria,
          turno: t.turno,
          cobrancaAtiva: t.cobrancaAtiva,
          avisoAntesMinutos: t.avisoAntesMinutos,
          avisoAtrasoResponsavelMinutos: t.avisoAtrasoResponsavelMinutos,
          alertaCriticoMinutos: t.alertaCriticoMinutos,
          naoRealizadoMinutos: t.naoRealizadoMinutos,
        }))}
        showChecklistEmpresaColumn={ctx?.mode === "grupo"}
        canEditChecklistNotificacoes={canEditChecklistNotificacoes}
        saipos={
          isAdmin && ctx?.mode === "single"
            ? {
                lojaId: ctx.empresa.saiposLojaId,
                syncEnabled: ctx.empresa.saiposSyncEnabled,
                hasToken: !!ctx.empresa.saiposApiToken,
                lastSyncAt: ctx.empresa.saiposLastSyncAt?.toISOString() ?? null,
              }
            : null
        }
        metaAds={
          isAdmin && ctx?.mode === "single"
            ? {
                adAccountId: ctx.empresa.metaAdsAdAccountId,
                adAccountName: ctx.empresa.metaAdsAdAccountName,
                graphVersion: ctx.empresa.metaAdsGraphVersion,
                instagramAccountId: ctx.empresa.metaAdsInstagramAccountId,
                instagramUsername: ctx.empresa.metaAdsInstagramUsername,
                syncEnabled: ctx.empresa.metaAdsSyncEnabled,
                hasToken: !!ctx.empresa.metaAdsAccessToken,
                lastSyncAt: ctx.empresa.metaAdsLastSyncAt?.toISOString() ?? null,
              }
            : null
        }
      />
    </PageContainer>
  );
}
