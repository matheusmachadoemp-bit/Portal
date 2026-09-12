import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { empresaIdsForContext, getActiveEmpresaContext, getUserEmpresas } from "@/lib/empresa";
import { canManageUsers } from "@/lib/permissions";
import { hasModulePermission } from "@/lib/authz";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModulePermission(session.user.id, "universidade", "canView"))) {
    return NextResponse.json({ error: "Seu perfil de permissão não permite ver a Universidade." }, { status: 403 });
  }

  const ctx = await getActiveEmpresaContext();
  const empresaIds = ctx ? empresaIdsForContext(ctx) : [];

  const items = await prisma.trainingLibraryItem.findMany({
    where: { OR: [{ empresaId: null }, { empresaId: { in: empresaIds } }] },
    orderBy: { createdAt: "desc" },
    include: { uploadedBy: { select: { name: true } } },
  });

  return NextResponse.json({ items });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canManageUsers(session.user.role)) {
    return NextResponse.json({ error: "Sem permissão para adicionar itens à biblioteca." }, { status: 403 });
  }
  if (!(await hasModulePermission(session.user.id, "universidade", "canCreate"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite adicionar itens à biblioteca." },
      { status: 403 }
    );
  }

  const body = await req.json();
  if (!body.name || !body.fileUrl) {
    return NextResponse.json({ error: "Nome e arquivo são obrigatórios." }, { status: 400 });
  }

  let empresaId: string | null = null;
  if (body.empresaId) {
    const empresas = await getUserEmpresas(session.user.id, session.user.role);
    if (!empresas.some((e) => e.id === body.empresaId)) {
      return NextResponse.json({ error: "Loja inválida para esse item." }, { status: 400 });
    }
    empresaId = body.empresaId;
  }

  const item = await prisma.trainingLibraryItem.create({
    data: {
      name: body.name,
      category: body.category || "Documentos",
      fileUrl: body.fileUrl,
      mimeType: body.mimeType || null,
      sizeBytes: body.sizeBytes ? Number(body.sizeBytes) : null,
      tags: body.tags || null,
      empresaId,
      uploadedById: session.user.id,
    },
  });

  return NextResponse.json({ item });
}
