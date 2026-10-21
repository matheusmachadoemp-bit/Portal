import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { hasModulePermission } from "@/lib/authz";

/** POST — adiciona um comentário interno ao relato (admin only — conversa entre quem está
 * tratando o bug/sugestão, não visível ao usuário que reportou nesta Fase 1). */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "ADMINISTRADOR" || !(await hasModulePermission(session.user.id, "bugs-melhorias", "canEdit"))) {
    return NextResponse.json({ error: "Sem permissão para comentar na Central de Bugs e Melhorias." }, { status: 403 });
  }

  const { id } = await params;
  const existing = await prisma.feedbackReport.findUnique({ where: { id }, select: { id: true } });
  if (!existing) return NextResponse.json({ error: "Relato não encontrado." }, { status: 404 });

  const body = await req.json().catch(() => null);
  const conteudo = String(body?.conteudo ?? "").trim();
  if (!conteudo) return NextResponse.json({ error: "Escreva um comentário." }, { status: 400 });

  const comment = await prisma.feedbackComment.create({
    data: { feedbackReportId: id, autorId: session.user.id, conteudo: conteudo.slice(0, 4000) },
    include: { autor: { select: { id: true, name: true } } },
  });

  return NextResponse.json({ comment }, { status: 201 });
}
