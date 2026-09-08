import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { getUserEmpresas } from "@/lib/empresa";
import { hasModulePermission } from "@/lib/authz";

const MANAGER_ROLES = ["ADMINISTRADOR", "GESTOR", "GERENTE", "SUPERVISOR"];

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!MANAGER_ROLES.includes(session.user.role)) {
    return NextResponse.json({ error: "Sem permissão para excluir itens da biblioteca." }, { status: 403 });
  }
  if (!(await hasModulePermission(session.user.id, "universidade", "canDelete"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite excluir itens da biblioteca." },
      { status: 403 }
    );
  }
  const { id } = await params;

  const existing = await prisma.trainingLibraryItem.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Não encontrado." }, { status: 404 });
  if (existing.empresaId) {
    const empresasPermitidas = (await getUserEmpresas(session.user.id, session.user.role)).map((e) => e.id);
    if (!empresasPermitidas.includes(existing.empresaId)) {
      return NextResponse.json({ error: "Sem acesso a essa loja." }, { status: 403 });
    }
  }

  await prisma.trainingLibraryItem.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
