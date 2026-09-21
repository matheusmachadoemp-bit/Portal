import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { assertEmpresaAccess } from "@/lib/empresa";
import { loadSupplierReceivingHistory } from "@/lib/recebimento-server";
import { hasModulePermission } from "@/lib/authz";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const supplier = await prisma.supplier.findUnique({ where: { id }, select: { empresaId: true } });
  if (!supplier) return NextResponse.json({ error: "Não encontrado." }, { status: 404 });
  if (!(await assertEmpresaAccess(session.user.id, session.user.role, supplier.empresaId))) {
    return NextResponse.json({ error: "Sem acesso a essa loja." }, { status: 403 });
  }
  if (!(await hasModulePermission(session.user.id, "estoque", "canView"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite ver o Estoque." },
      { status: 403 }
    );
  }

  const historico = await loadSupplierReceivingHistory(id);
  return NextResponse.json({ historico });
}
