import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { assertEmpresaAccess } from "@/lib/empresa";
import { hasModulePermission } from "@/lib/authz";
import { isValidBlobUrl } from "@/lib/manutencao-server";

// BUG-004b: as rotas irmãs `[id]` de RH (`/api/rh/documents/[id]`, `/api/rh/occurrences/[id]`,
// `/api/rh/vacations/[id]`, `/api/rh/time-entries/[id]`) já têm essa checagem de cargo no
// PATCH/DELETE desde o commit f109b8e — só faltava aqui.
const MANAGER_ROLES = ["ADMINISTRADOR", "GESTOR", "GERENTE", "SUPERVISOR"];

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!MANAGER_ROLES.includes(session.user.role)) {
    return NextResponse.json({ error: "Acesso restrito a gestores." }, { status: 403 });
  }
  const { id } = await params;
  const existing = await prisma.uniformDelivery.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Não encontrado." }, { status: 404 });
  if (!(await assertEmpresaAccess(session.user.id, session.user.role, existing.empresaId))) {
    return NextResponse.json({ error: "Sem acesso a essa loja." }, { status: 403 });
  }
  if (!(await hasModulePermission(session.user.id, "rh", "canEdit"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite editar entregas de uniforme." },
      { status: 403 }
    );
  }
  const body = await req.json();

  if (body.termoAssinadoUrl && !isValidBlobUrl(body.termoAssinadoUrl)) {
    return NextResponse.json({ error: "URL de arquivo inválida." }, { status: 400 });
  }

  const delivery = await prisma.uniformDelivery.update({
    where: { id },
    data: {
      item: body.item ?? undefined,
      quantidade: body.quantidade !== undefined ? Number(body.quantidade) : undefined,
      tamanho: body.tamanho ?? undefined,
      dataEntrega: body.dataEntrega ? new Date(body.dataEntrega) : undefined,
      responsavel: body.responsavel ?? undefined,
      status: body.status ?? undefined,
      observacao: body.observacao ?? undefined,
      termoAssinadoUrl: "termoAssinadoUrl" in body ? (body.termoAssinadoUrl ?? null) : undefined,
      termoAssinadoNome: "termoAssinadoNome" in body ? (body.termoAssinadoNome ?? null) : undefined,
      termoAssinadoMimeType:
        "termoAssinadoMimeType" in body ? (body.termoAssinadoMimeType ?? null) : undefined,
    },
  });

  return NextResponse.json({ delivery });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!MANAGER_ROLES.includes(session.user.role)) {
    return NextResponse.json({ error: "Acesso restrito a gestores." }, { status: 403 });
  }
  const { id } = await params;
  const existing = await prisma.uniformDelivery.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Não encontrado." }, { status: 404 });
  if (!(await assertEmpresaAccess(session.user.id, session.user.role, existing.empresaId))) {
    return NextResponse.json({ error: "Sem acesso a essa loja." }, { status: 403 });
  }
  if (!(await hasModulePermission(session.user.id, "rh", "canDelete"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite excluir entregas de uniforme." },
      { status: 403 }
    );
  }
  await prisma.uniformDelivery.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
