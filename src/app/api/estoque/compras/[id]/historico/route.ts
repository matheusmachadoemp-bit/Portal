import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { assertEmpresaAccess } from "@/lib/empresa";
import { hasModulePermission } from "@/lib/authz";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const purchase = await prisma.purchase.findUnique({ where: { id }, select: { empresaId: true } });
  if (!purchase) return NextResponse.json({ error: "Não encontrada." }, { status: 404 });
  if (!(await assertEmpresaAccess(session.user.id, session.user.role, purchase.empresaId))) {
    return NextResponse.json({ error: "Sem acesso a essa loja." }, { status: 403 });
  }
  if (!(await hasModulePermission(session.user.id, "estoque", "canView"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite ver o Estoque." },
      { status: 403 }
    );
  }

  const eventos = await prisma.auditLog.findMany({
    where: { entityType: "Purchase", entityId: id },
    orderBy: { createdAt: "asc" },
    include: { user: { select: { name: true } } },
  });

  return NextResponse.json({ eventos });
}
