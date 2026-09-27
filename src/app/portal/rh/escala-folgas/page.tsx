import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { hasModulePermission } from "@/lib/authz";
import { PageContainer } from "@/components/page-container";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";
import { resolveOwnSetor } from "@/lib/escala-folgas-server";
import { EscalaFolgasClient } from "./escala-folgas-client";

/**
 * Escala de Folgas (RH) — Fase 2a: calendário mensal, só leitura (PR #363). Fase 2b (aqui): criar/
 * editar/cancelar folga direto pelo calendário, com o aviso de cobertura mínima do setor. Resolve
 * permissão/contexto aqui (Server Component) e devolve pro client só o necessário pra montar os
 * filtros e o formulário — os dados do calendário em si (`getCalendarioDias`) são buscados pelo
 * client direto em `GET /api/rh/escala-folgas/calendario`, que já é a única fonte da verdade pra
 * essa restrição (evita duplicar aqui a regra "Líder só vê o próprio setor" que a rota já aplica).
 * As 3 rotas de escrita (`POST`/`PATCH`/`DELETE /api/rh/escala-folgas/entries`) já existem prontas
 * desde a Fase 1 (PR #346, schema + regras de negócio, inclusive o cálculo de cobertura) — esta
 * fase só precisava do formulário na tela e das 3 flags de permissão abaixo pra liberá-lo.
 */
export default async function EscalaFolgasPage() {
  const session = await auth();
  if (!session?.user || !(await hasModulePermission(session.user.id, "rh", "canView"))) {
    redirect("/portal/inicio");
  }

  const ctx = await getActiveEmpresaContext();
  const empresaIds = ctx ? empresaIdsForContext(ctx) : [];
  const isSupervisor = session.user.role === "SUPERVISOR";

  // Líder (SUPERVISOR): a API já restringe ao próprio setor de qualquer forma, então o filtro de
  // setor não tem utilidade nenhuma pra esse perfil — nem vale a pena buscar o catálogo completo.
  // Os demais perfis com acesso ao RH (Gerente/Gestor/Administrador) veem e filtram por qualquer
  // setor da(s) loja(s) ativa(s).
  let ownSetor: string | null = null;
  let setores: string[] = [];
  if (isSupervisor) {
    ownSetor = await resolveOwnSetor(session.user.id);
  } else {
    const rows = await prisma.employee.findMany({
      where: { empresaId: { in: empresaIds } },
      select: { setor: true },
      distinct: ["setor"],
      orderBy: { setor: "asc" },
    });
    setores = rows.map((r) => r.setor).filter((s) => s.trim().length > 0);
  }

  // Fase 2b: 3 flags de permissão separadas — mesmo padrão já usado em Marketing (Tráfego Pago/
  // Ideias/Parcerias/Tarefas, commits a41cce2/42c97e9): "criar" depende também do modo de
  // visualização (`POST /api/rh/escala-folgas/entries` exige uma loja específica selecionada via
  // `requireActiveSingleEmpresa` — não dá pra saber em qual loja gravar uma folga nova no modo
  // Grupo Nord consolidado), mas editar/excluir uma folga já existente NÃO tem essa ambiguidade (a
  // folga já pertence a uma loja definida — `PATCH`/`DELETE` conferem acesso a essa loja específica
  // via `assertEmpresaAccess`, não ao modo de visualização atual) — por isso usam só a permissão
  // crua, sem combinar com `ctx.mode`.
  const canManageRh = await hasModulePermission(session.user.id, "rh", "canCreate");
  const canCreate = ctx?.mode === "single" && canManageRh;
  const canEdit = await hasModulePermission(session.user.id, "rh", "canEdit");
  const canDelete = await hasModulePermission(session.user.id, "rh", "canDelete");

  // Colaboradores ATIVOS pro select de "Colaborador" do formulário "Adicionar folga" — só busca
  // quando o formulário pode de fato ser usado (`canCreate`, que já implica loja única
  // selecionada). Líder (SUPERVISOR) só pode cadastrar folga pra alguém do próprio setor (a API já
  // valida isso e devolve 403 se tentar de outro, mas a tela nem deve oferecer a opção) — filtra
  // aqui pra nunca vazar nome de colaborador de outro setor pro Líder.
  const employees =
    ctx && ctx.mode === "single" && canManageRh
      ? await prisma.employee.findMany({
          where: {
            empresaId: ctx.empresa.id,
            status: "ATIVO",
            ...(isSupervisor && ownSetor ? { setor: ownSetor } : {}),
          },
          select: { id: true, name: true, setor: true, cargo: true },
          orderBy: { name: "asc" },
        })
      : [];

  return (
    <PageContainer title="RH" subtitle="Escala de Folgas">
      <EscalaFolgasClient
        isSupervisor={isSupervisor}
        ownSetor={ownSetor}
        setores={setores}
        isGrupoNordMode={ctx?.mode !== "single"}
        canCreate={canCreate}
        canEdit={canEdit}
        canDelete={canDelete}
        employees={employees}
      />
    </PageContainer>
  );
}
