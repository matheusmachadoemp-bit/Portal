import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { hasModulePermission } from "@/lib/authz";
import { assertEmpresaAccess } from "@/lib/empresa";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModulePermission(session.user.id, "metas", "canCreate"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite anexar arquivos a metas." },
      { status: 403 }
    );
  }
  const { id } = await params;
  const existing = await prisma.goal.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Não encontrado." }, { status: 404 });
  if (!(await assertEmpresaAccess(session.user.id, session.user.role, existing.empresaId))) {
    return NextResponse.json({ error: "Sem acesso a essa loja." }, { status: 403 });
  }
  const body = await req.json();

  const attachment = await prisma.goalAttachment.create({
    data: { goalId: id, fileName: body.fileName, fileUrl: body.fileUrl },
  });

  return NextResponse.json({ attachment });
}
