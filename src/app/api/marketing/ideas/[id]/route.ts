import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { assertEmpresaAccess } from "@/lib/empresa";
import { IDEA_APPROVER_ROLES, IDEA_STATUS_OPTIONS } from "@/lib/marketing";
import { hasModulePermission } from "@/lib/authz";

const STR_FIELDS = ["title", "description", "references", "links", "category", "tags", "status"] as const;
const APPROVAL_STATUSES = ["APROVADA", "DESCARTADA"];
// Mesmos valores do enum `MarketingIdeaStatus` (prisma/schema.prisma) — reaproveita
// `IDEA_STATUS_OPTIONS` (fonte única já usada pela tela do Banco de Ideias) em vez de duplicar
// a lista aqui.
const VALID_IDEA_STATUSES: string[] = IDEA_STATUS_OPTIONS.map((o) => o.key);

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const existing = await prisma.marketingIdea.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Não encontrado." }, { status: 404 });
  if (!(await assertEmpresaAccess(session.user.id, session.user.role, existing.empresaId))) {
    return NextResponse.json({ error: "Sem acesso a essa loja." }, { status: 403 });
  }
  const body = await req.json();

  // Achado (Nina, auditoria geral): `status` é um enum fixo do Prisma (`MarketingIdeaStatus`) —
  // sem esta validação, um valor fora do enum só seria pego quando o Prisma Client lançasse ao
  // tentar gravar, derrubando a rota com um erro cru em vez de uma resposta 400 clara.
  if (body.status !== undefined && body.status !== null && !VALID_IDEA_STATUSES.includes(body.status)) {
    return NextResponse.json(
      { error: `Status inválido. Valores aceitos: ${VALID_IDEA_STATUSES.join(", ")}.` },
      { status: 400 }
    );
  }

  const isApprovalAction = body.promote || (typeof body.status === "string" && APPROVAL_STATUSES.includes(body.status));
  if (isApprovalAction && !IDEA_APPROVER_ROLES.includes(session.user.role)) {
    return NextResponse.json({ error: "Sem permissão para aprovar ou reprovar ideias." }, { status: 403 });
  }
  if (!(await hasModulePermission(session.user.id, "marketing", "canEdit"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite editar ideias de marketing." },
      { status: 403 }
    );
  }

  const data: Record<string, unknown> = {};
  for (const f of STR_FIELDS) {
    if (body[f] !== undefined) data[f] = body[f] || null;
  }

  const idea = await prisma.marketingIdea.update({ where: { id }, data });

  if (body.promote) {
    const task = await prisma.marketingTask.create({
      data: {
        empresaId: existing.empresaId,
        title: existing.title,
        description: existing.description,
        category: existing.category,
        tags: existing.tags,
        status: "A_PRODUZIR",
        createdById: session.user.id,
      },
    });
    await prisma.marketingIdea.update({ where: { id }, data: { status: "APROVADA" } });
    return NextResponse.json({ idea, task });
  }

  return NextResponse.json({ idea });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const existing = await prisma.marketingIdea.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Não encontrado." }, { status: 404 });
  if (!(await assertEmpresaAccess(session.user.id, session.user.role, existing.empresaId))) {
    return NextResponse.json({ error: "Sem acesso a essa loja." }, { status: 403 });
  }
  if (!(await hasModulePermission(session.user.id, "marketing", "canDelete"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite excluir ideias de marketing." },
      { status: 403 }
    );
  }
  await prisma.marketingIdea.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
