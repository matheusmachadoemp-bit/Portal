import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";
import { hasModulePermission } from "@/lib/authz";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const ctx = await getActiveEmpresaContext();
  if (!ctx) return NextResponse.json({ error: "Sem acesso a nenhuma loja." }, { status: 403 });

  const reward = await prisma.loyaltyReward.findFirst({ where: { id, empresaId: { in: empresaIdsForContext(ctx) } } });
  if (!reward) return NextResponse.json({ error: "Recompensa não encontrada." }, { status: 404 });
  if (!(await hasModulePermission(session.user.id, "crm", "canEdit"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite editar recompensas de fidelidade." },
      { status: 403 }
    );
  }

  const body = await req.json();
  const updated = await prisma.loyaltyReward.update({
    where: { id },
    data: { ativo: body.ativo !== undefined ? !!body.ativo : undefined },
  });
  return NextResponse.json({ reward: updated });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const ctx = await getActiveEmpresaContext();
  if (!ctx) return NextResponse.json({ error: "Sem acesso a nenhuma loja." }, { status: 403 });

  const reward = await prisma.loyaltyReward.findFirst({ where: { id, empresaId: { in: empresaIdsForContext(ctx) } } });
  if (!reward) return NextResponse.json({ error: "Recompensa não encontrada." }, { status: 404 });
  if (!(await hasModulePermission(session.user.id, "crm", "canDelete"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite excluir recompensas de fidelidade." },
      { status: 403 }
    );
  }

  await prisma.loyaltyReward.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
