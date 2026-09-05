import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";
import { generateInvitations } from "@/lib/satisfaction-server";

const CAN_MANAGE_ROLES = ["ADMINISTRADOR", "GESTOR", "GERENTE"];

async function findAccessibleSurvey(id: string) {
  const ctx = await getActiveEmpresaContext();
  if (!ctx) return null;
  const empresaIds = empresaIdsForContext(ctx);
  return prisma.satisfactionSurvey.findFirst({ where: { id, publico: { some: { empresaId: { in: empresaIds } } } } });
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const survey = await findAccessibleSurvey(id);
  if (!survey) return NextResponse.json({ error: "Pesquisa não encontrada." }, { status: 404 });

  const invitations = await prisma.satisfactionInvitation.findMany({
    where: { surveyId: id },
    include: { employee: { select: { id: true, name: true, setor: true } } },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json({ invitations });
}

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!CAN_MANAGE_ROLES.includes(session.user.role)) {
    return NextResponse.json({ error: "Sem permissão para gerar convites." }, { status: 403 });
  }

  const { id } = await params;
  const survey = await findAccessibleSurvey(id);
  if (!survey) return NextResponse.json({ error: "Pesquisa não encontrada." }, { status: 404 });
  if (survey.status === "RASCUNHO") {
    return NextResponse.json({ error: "Publique a pesquisa antes de gerar os convites." }, { status: 400 });
  }

  const result = await generateInvitations(id);
  return NextResponse.json(result);
}
