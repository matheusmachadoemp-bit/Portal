import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { empresaIdsForContext, getActiveEmpresaContext, requireActiveSingleEmpresa } from "@/lib/empresa";
import { computeGoalStatus, GERENCIA_RESPONSAVEL, GOAL_CATEGORY_ROUTE, type GoalDirectionKey } from "@/lib/goals";
import { formatNumber } from "@/lib/calc";
import { hasModulePermission } from "@/lib/authz";
import { getStoreManagers } from "@/lib/manutencao-server";
import { createNotifications } from "@/lib/notifications";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModulePermission(session.user.id, "metas", "canView"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite ver o Metas." },
      { status: 403 }
    );
  }

  const ctx = await getActiveEmpresaContext();
  if (!ctx) return NextResponse.json({ error: "Sem acesso a nenhuma loja." }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const category = searchParams.get("category");

  const goals = await prisma.goal.findMany({
    where: {
      empresaId: { in: empresaIdsForContext(ctx) },
      ...(category ? { category: category as never } : {}),
    },
    orderBy: { endDate: "asc" },
    include: { attachments: true, weeklyUpdates: { orderBy: { weekNumber: "asc" } } },
  });

  return NextResponse.json({ goals });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModulePermission(session.user.id, "metas", "canCreate"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite criar metas." },
      { status: 403 }
    );
  }

  const empresa = await requireActiveSingleEmpresa();
  if (!empresa) {
    return NextResponse.json(
      { error: "Selecione uma loja específica (não é possível criar metas no modo Grupo Nord)." },
      { status: 400 }
    );
  }

  const body = await req.json();

  if (!body.name || !String(body.name).trim()) {
    return NextResponse.json({ error: "Nome da meta é obrigatório." }, { status: 400 });
  }
  const valorMetaNum = Number(body.valorMeta);
  if (!body.valorMeta || !Number.isFinite(valorMetaNum) || valorMetaNum <= 0) {
    return NextResponse.json(
      { error: "Valor da meta é obrigatório e deve ser maior que zero." },
      { status: 400 }
    );
  }

  const valorMeta = valorMetaNum;
  const unidade = body.unidade || "R$";
  const endDate = new Date(body.endDate);
  const category = body.category;

  // Whitelist explícito (em vez de confiar direto em `body.direcao`, um
  // `any` vindo do JSON) — qualquer valor que não seja exatamente
  // "MINIMIZAR" cai no default MAXIMIZAR, o mesmo default do schema.
  const direcao: GoalDirectionKey = body.direcao === "MINIMIZAR" ? "MINIMIZAR" : "MAXIMIZAR";

  // Metas > Gerência: "responsável" nunca é um texto livre digitado no
  // formulário (ver GERENCIA_RESPONSAVEL em src/lib/goals.ts) — forçado
  // aqui no servidor, não só escondendo o campo na tela, para que um POST
  // direto na API (sem passar pelo formulário) também respeite a regra.
  const responsavel = category === "GERENCIA" ? GERENCIA_RESPONSAVEL : body.responsavel;

  // `valorRealizado` nunca é aceito na criação: toda meta nova começa
  // zerada e só sobe através dos lançamentos semanais (ver
  // POST /api/metas/[id]/semanas) — nunca mais um número digitado direto
  // aqui, mesmo que o body envie um.
  const goal = await prisma.goal.create({
    data: {
      empresaId: empresa.id,
      name: body.name,
      category,
      responsavel,
      description: body.description || null,
      indicador: body.indicador || null,
      valorMeta,
      unidade,
      direcao,
      startDate: new Date(body.startDate),
      endDate,
      bonificacao: body.bonificacao || null,
      status: computeGoalStatus(0, valorMeta, endDate, new Date(), direcao, unidade) as never,
      observacoes: body.observacoes || null,
      planoDeAcao: body.planoDeAcao || null,
      createdById: session.user.id,
    },
    include: { attachments: true, weeklyUpdates: true },
  });

  // Pedido: toda meta nova de Gerência avisa (sino + push, ver
  // createNotifications) o(s) gerente(s) responsável(is) pela loja — só
  // esta categoria, porque só ela tem um "responsável" resolvido para
  // pessoas de verdade (GERENTE da loja + ADMINISTRADOR/GESTOR, mesmo
  // critério de getStoreManagers já usado por processGoalAlerts para a
  // meta não atingida). As outras 5 categorias guardam `responsavel` como
  // texto livre digitado à mão, sem vínculo confiável com um usuário do
  // Portal — tentar "adivinhar" esse vínculo por nome poderia notificar a
  // pessoa errada (nome duplicado) ou ninguém (sem correspondência), então
  // ficou fora do escopo aqui. Quem criou a própria meta não recebe aviso
  // sobre a própria ação (mesmo padrão já usado em outras notificações do
  // Portal, ex.: POST /api/tarefas/[id]/comprovar).
  if (category === "GERENCIA") {
    const managerIds = (await getStoreManagers(empresa.id)).filter((id) => id !== session.user.id);
    if (managerIds.length > 0) {
      await createNotifications(
        managerIds.map((userId) => ({
          userId,
          type: "META_NOVA",
          title: "Nova meta de Gerência",
          body: `${goal.name} — meta de ${formatNumber(valorMeta)} ${goal.unidade}.`,
          priority: "INFORMACAO" as const,
          goalId: goal.id,
          url: `/portal/metas/${GOAL_CATEGORY_ROUTE.GERENCIA}`,
        }))
      );
    }
  }

  return NextResponse.json({ goal });
}
