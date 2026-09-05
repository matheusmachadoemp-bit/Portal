import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";
import { computeSurveyStatus } from "@/lib/satisfaction";
import type { SatisfactionQuestionType, SatisfactionTheme } from "@prisma/client";

const CAN_CREATE_ROLES = ["ADMINISTRADOR", "GESTOR", "GERENTE"];

const LIST_INCLUDE = {
  publico: { include: { empresa: { select: { id: true, name: true } } } },
  perguntas: { select: { id: true } },
  createdBy: { select: { id: true, name: true } },
};

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ctx = await getActiveEmpresaContext();
  if (!ctx) return NextResponse.json({ error: "Sem acesso a nenhuma loja." }, { status: 403 });
  const empresaIds = empresaIdsForContext(ctx);

  const surveys = await prisma.satisfactionSurvey.findMany({
    where: { publico: { some: { empresaId: { in: empresaIds } } } },
    include: LIST_INCLUDE,
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ surveys });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!CAN_CREATE_ROLES.includes(session.user.role)) {
    return NextResponse.json({ error: "Sem permissão para criar pesquisas." }, { status: 403 });
  }

  const ctx = await getActiveEmpresaContext();
  if (!ctx) return NextResponse.json({ error: "Sem acesso a nenhuma loja." }, { status: 403 });
  const allowedEmpresaIds = new Set(empresaIdsForContext(ctx));

  const body = await req.json();
  const publico: { empresaId: string; setor: string | null }[] = body.publico || [];
  if (publico.length === 0) {
    return NextResponse.json({ error: "Selecione pelo menos uma loja para o público da pesquisa." }, { status: 400 });
  }
  for (const p of publico) {
    if (!allowedEmpresaIds.has(p.empresaId)) {
      return NextResponse.json({ error: "Você não tem acesso a uma das lojas selecionadas." }, { status: 403 });
    }
  }

  const perguntas: Record<string, unknown>[] = body.perguntas || [];
  const startDate = new Date(body.startDate);
  const endDate = new Date(body.endDate);
  const status = computeSurveyStatus({ startDate, endDate, currentStatus: "RASCUNHO", publish: body.publish === true });

  const survey = await prisma.satisfactionSurvey.create({
    data: {
      title: body.title,
      description: body.description || null,
      startDate,
      endDate,
      status,
      anonima: body.anonima ?? true,
      permitirApenasUmaResposta: body.permitirApenasUmaResposta ?? true,
      exibirResultadoColaborador: body.exibirResultadoColaborador ?? false,
      permitirComentarioAdicional: body.permitirComentarioAdicional ?? true,
      embaralharPerguntas: body.embaralharPerguntas ?? false,
      createdById: session.user.id,
      publico: { create: publico.map((p) => ({ empresaId: p.empresaId, setor: p.setor || null })) },
      perguntas: {
        create: perguntas.map((p, idx) => ({
          tipo: (p.tipo as SatisfactionQuestionType) || "AVALIACAO",
          tema: (p.tema as SatisfactionTheme) || null,
          titulo: p.titulo as string,
          orientacao: (p.orientacao as string) || null,
          obrigatoria: (p.obrigatoria as boolean) ?? true,
          ordem: idx,
          opcoes: {
            create: ((p.opcoes as { texto: string }[]) || []).map((o, oidx) => ({ texto: o.texto, ordem: oidx })),
          },
        })),
      },
    },
    include: LIST_INCLUDE,
  });

  return NextResponse.json({ survey });
}
