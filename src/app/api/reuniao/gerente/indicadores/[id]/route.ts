import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { requireActiveSingleEmpresa } from "@/lib/empresa";
import { hasModulePermission } from "@/lib/authz";

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModulePermission(session.user.id, "reuniao", "canEdit"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite excluir metas da Reunião Gerente." },
      { status: 403 }
    );
  }

  const empresa = await requireActiveSingleEmpresa();
  if (!empresa) {
    return NextResponse.json(
      { error: "Selecione uma loja específica (não é possível excluir metas no modo Grupo Nord)." },
      { status: 400 }
    );
  }

  const { id } = await params;
  const indicator = await prisma.gerenteCustomIndicator.findUnique({ where: { id } });
  if (!indicator || indicator.empresaId !== empresa.id) {
    return NextResponse.json({ error: "Meta não encontrada." }, { status: 404 });
  }

  // Os valores mensais (GerenteCustomIndicatorValue) são apagados junto via onDelete: Cascade —
  // exclui só essa meta, sem afetar o resto do fechamento do mês (GerenteMeeting).
  await prisma.gerenteCustomIndicator.delete({ where: { id } });

  return NextResponse.json({ ok: true });
}
