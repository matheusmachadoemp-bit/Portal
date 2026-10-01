import { prisma } from "@/lib/prisma";
import { PageContainer } from "@/components/page-container";
import { ContagemClient } from "./contagem-client";
import { empresaIdsForContext, getActiveEmpresaContext, getSelectableTeamMembers } from "@/lib/empresa";
import { auth } from "@/auth";
import { hasModulePermission } from "@/lib/authz";
import { redirect } from "next/navigation";

export default async function ContagemEstoquePage() {
  const session = await auth();
  if (!session?.user || !(await hasModulePermission(session.user.id, "estoque", "canView"))) {
    redirect("/portal/inicio");
  }

  const ctx = await getActiveEmpresaContext();
  const empresaIds = ctx ? empresaIdsForContext(ctx) : [];
  const canManageEstoque = await hasModulePermission(session.user.id, "estoque", "canCreate");
  const canCreate = ctx?.mode === "single" && canManageEstoque;
  // Editar/excluir uma contagem já criada (PATCH/DELETE /api/estoque/contagens/[id]) — a API
  // checa acesso à empresa específica da contagem (não exige "loja única ativa" como o
  // `canCreate` acima), então não trava por `ctx?.mode === "single"` aqui.
  const canEdit = await hasModulePermission(session.user.id, "estoque", "canEdit");
  const canDelete = await hasModulePermission(session.user.id, "estoque", "canDelete");
  // Agenda de lembretes (StockCountSchedule): configuração protegida por canEdit em todos os
  // verbos (ver comentário em GET /api/estoque/contagens/agenda) — "criar" (POST) também exige
  // uma loja única ativa (`requireActiveSingleEmpresa`), igual `canCreate` de contagem acima.
  const canManageAgenda = await hasModulePermission(session.user.id, "estoque", "canEdit");
  const canCreateAgenda = ctx?.mode === "single" && canManageAgenda;

  const [semanais, mensais, employees, setores, users] = await Promise.all([
    prisma.stockCount.findMany({
      where: { empresaId: { in: empresaIds }, type: "SEMANAL" },
      orderBy: { dataContagem: "desc" },
      take: 30,
      include: { items: true, createdBy: { select: { name: true } } },
    }),
    prisma.stockCount.findMany({
      where: { empresaId: { in: empresaIds }, type: "MENSAL" },
      orderBy: { dataContagem: "desc" },
      take: 24,
      include: { items: true, createdBy: { select: { name: true } } },
    }),
    prisma.employee.findMany({
      where: { empresaId: { in: empresaIds }, status: "ATIVO" },
      orderBy: { name: "asc" },
    }),
    prisma.stockSector.findMany({ where: { active: true }, orderBy: { order: "asc" } }),
    // Usuários (`User`, não `Employee`) selecionáveis como responsável pelo lembrete de
    // notificação — a agenda notifica por sessão de login (push via `PushSubscription`, ligada
    // a `User`), diferente do responsável "de chão de fábrica" da contagem em si, que é um nome
    // livre escolhido entre `Employee` (ver `employees` acima). Mesmo helper usado por Tarefas,
    // Checklist, Produção, Manutenção, Marketing, Loja Nord e Recebimento de estoque.
    getSelectableTeamMembers(empresaIds),
  ]);

  return (
    <PageContainer title="Estoque" subtitle="Contagem de Estoque">
      <div className="space-y-6">
        <ContagemClient
          initialSemanais={semanais.map((c) => ({
            id: c.id,
            setor: c.setor,
            semana: c.semana,
            ano: c.ano,
            dataContagem: c.dataContagem.toISOString(),
            responsavel: c.responsavel,
            horaInicio: c.horaInicio,
            horaFim: c.horaFim,
            status: c.status,
            totalItens: c.items.length,
            conferidos: c.items.filter((i) => i.quantidadeContada !== null).length,
            createdByName: c.createdBy.name,
          }))}
          initialMensais={mensais.map((c) => ({
            id: c.id,
            setor: c.setor,
            mes: c.mes,
            ano: c.ano,
            dataContagem: c.dataContagem.toISOString(),
            responsavel: c.responsavel,
            status: c.status,
            checklistJson: c.checklistJson,
            aprovadoPor: c.aprovadoPor,
            aprovadoEm: c.aprovadoEm ? c.aprovadoEm.toISOString() : null,
            totalItens: c.items.length,
            conferidos: c.items.filter((i) => i.quantidadeContada !== null).length,
            createdByName: c.createdBy.name,
          }))}
          employees={employees.map((e) => ({ id: e.id, name: e.name }))}
          setores={setores.map((s) => s.name)}
          users={users}
          canCreate={canCreate}
          canEdit={canEdit}
          canDelete={canDelete}
          canCreateAgenda={canCreateAgenda}
          canManageAgenda={canManageAgenda}
          userRole={session?.user?.role ?? ""}
        />
      </div>
    </PageContainer>
  );
}
