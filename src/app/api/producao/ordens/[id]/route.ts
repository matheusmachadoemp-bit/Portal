import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import {
  finalizarProductionOrder,
  iniciarProductionOrder,
  logProductionOrderHistory,
  PRODUCTION_MANAGER_ROLES,
} from "@/lib/producao-server";
import { hasModulePermission } from "@/lib/authz";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const ordem = await prisma.productionOrder.findUnique({
    where: { id },
    include: {
      productionItem: { include: { category: true } },
      responsavel: { select: { id: true, name: true } },
      ajustePor: { select: { id: true, name: true } },
      forecast: true,
      history: { orderBy: { createdAt: "desc" }, include: { user: { select: { id: true, name: true } } } },
    },
  });
  if (!ordem) return NextResponse.json({ error: "Ordem de produção não encontrada." }, { status: 404 });

  return NextResponse.json({ ordem });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // As 4 ações (iniciar/finalizar/ajustar/reatribuir) são todas transições de status de uma
  // ProductionOrder já existente, nunca criam uma ordem nova — mesmo critério de canEdit já usado
  // em manutencao/preventivas/ocorrencias/[id] e checklist/occurrences/[id]/responses. Nota: hoje
  // "iniciar"/"finalizar" não têm nenhum check de cargo próprio (qualquer colaborador logado pode
  // chamar, tipicamente quem está de fato produzindo), diferente de "ajustar"/"reatribuir" que já
  // exigem PRODUCTION_MANAGER_ROLES — esta checagem única cobre as 4 igualmente.
  if (!(await hasModulePermission(session.user.id, "producao", "canEdit"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite atualizar ordens de produção." },
      { status: 403 }
    );
  }

  const { id } = await params;
  const body = await req.json();

  if (body.action === "iniciar") {
    const ordem = await iniciarProductionOrder(id, session.user.id);
    return NextResponse.json({ ordem });
  }

  if (body.action === "finalizar") {
    const quantidadeProduzida = Number(body.quantidadeProduzida);
    if (!Number.isFinite(quantidadeProduzida) || quantidadeProduzida < 0) {
      return NextResponse.json({ error: "Informe uma quantidade produzida válida." }, { status: 400 });
    }
    const ordem = await finalizarProductionOrder(id, session.user.id, {
      quantidadeProduzida,
      observacao: body.observacao || null,
      fotoUrl: body.fotoUrl || null,
      validade: body.validade ? new Date(body.validade) : null,
    });
    return NextResponse.json({ ordem });
  }

  if (body.action === "ajustar") {
    if (!PRODUCTION_MANAGER_ROLES.includes(session.user.role)) {
      return NextResponse.json({ error: "Você não pode ajustar a quantidade sugerida." }, { status: 403 });
    }
    const quantidadeAprovada = Number(body.quantidadeAprovada);
    if (!Number.isFinite(quantidadeAprovada) || quantidadeAprovada < 0) {
      return NextResponse.json({ error: "Informe uma quantidade válida." }, { status: 400 });
    }
    if (!body.motivo) {
      return NextResponse.json({ error: "Informe o motivo do ajuste." }, { status: 400 });
    }
    const atual = await prisma.productionOrder.findUniqueOrThrow({ where: { id } });
    const ordem = await prisma.productionOrder.update({
      where: { id },
      data: {
        quantidadeAprovada,
        ajusteMotivo: body.motivo,
        ajusteValorOriginal: atual.quantidadeAprovada ?? atual.quantidadeSugerida,
        ajusteValorAlterado: quantidadeAprovada,
        ajustePorId: session.user.id,
        ajusteEm: new Date(),
      },
    });
    await logProductionOrderHistory(
      id,
      session.user.id,
      "AJUSTADO",
      `De ${atual.quantidadeAprovada ?? atual.quantidadeSugerida} para ${quantidadeAprovada} (${body.motivo})`
    );
    return NextResponse.json({ ordem });
  }

  if (body.action === "reatribuir") {
    if (!PRODUCTION_MANAGER_ROLES.includes(session.user.role)) {
      return NextResponse.json({ error: "Você não pode reatribuir o responsável." }, { status: 403 });
    }
    const ordem = await prisma.productionOrder.update({
      where: { id },
      data: { responsavelId: body.responsavelId || null, prazo: body.prazo ? new Date(body.prazo) : undefined, prioridade: body.prioridade ?? undefined },
    });
    await logProductionOrderHistory(id, session.user.id, "STATUS_ALTERADO", "Responsável/prazo/prioridade atualizados.");
    return NextResponse.json({ ordem });
  }

  return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
}
