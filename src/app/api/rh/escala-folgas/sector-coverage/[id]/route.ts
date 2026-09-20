import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { assertEmpresaAccess } from "@/lib/empresa";
import { hasModulePermission } from "@/lib/authz";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const existing = await prisma.sectorCoverageConfig.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Não encontrado." }, { status: 404 });
  if (!(await assertEmpresaAccess(session.user.id, session.user.role, existing.empresaId))) {
    return NextResponse.json({ error: "Sem acesso a essa loja." }, { status: 403 });
  }
  if (!(await hasModulePermission(session.user.id, "rh", "canEdit"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite editar cobertura mínima." },
      { status: 403 }
    );
  }

  const body = await req.json().catch(() => null);
  const data: { quantidadeMinima?: number; ativo?: boolean } = {};
  if (body?.quantidadeMinima !== undefined) {
    const quantidadeMinima = Number(body.quantidadeMinima);
    if (!Number.isInteger(quantidadeMinima) || quantidadeMinima < 0) {
      return NextResponse.json({ error: "Informe uma quantidade mínima válida (0 ou mais)." }, { status: 400 });
    }
    data.quantidadeMinima = quantidadeMinima;
  }
  if (typeof body?.ativo === "boolean") data.ativo = body.ativo;

  const sectorCoverageConfig = await prisma.sectorCoverageConfig.update({ where: { id }, data });
  return NextResponse.json({ sectorCoverageConfig });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const existing = await prisma.sectorCoverageConfig.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Não encontrado." }, { status: 404 });
  if (!(await assertEmpresaAccess(session.user.id, session.user.role, existing.empresaId))) {
    return NextResponse.json({ error: "Sem acesso a essa loja." }, { status: 403 });
  }
  if (!(await hasModulePermission(session.user.id, "rh", "canDelete"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite excluir cobertura mínima." },
      { status: 403 }
    );
  }
  await prisma.sectorCoverageConfig.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
