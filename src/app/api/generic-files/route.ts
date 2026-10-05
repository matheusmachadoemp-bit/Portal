import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { isValidBlobUrl } from "@/lib/manutencao-server";
import { canAccessGenericScope, resolveGenericScope } from "@/lib/generic-content";

// Pastas/arquivos do conteúdo genérico de fallback (`GenericFileItem`) — ver comentário completo
// em @/lib/generic-content. Irmã de /api/admin/files (FileItem/FileFolderType), mas sem o gate
// fixo "só ADMINISTRADOR/GESTOR": aqui a permissão é dinâmica, decidida por `hasModulePermission`
// pra key da categoria/subcategoria dona do conteúdo (pode liberar outros cargos, dependendo de
// como o Perfil de Permissão daquele módulo for configurado).

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const scope = await resolveGenericScope({
    categoryId: searchParams.get("categoryId"),
    subcategoryId: searchParams.get("subcategoryId"),
  });
  if (!scope) {
    return NextResponse.json({ error: "Categoria/subcategoria não encontrada." }, { status: 404 });
  }
  if (!(await canAccessGenericScope(session.user.id, scope, "canView"))) {
    return NextResponse.json({ error: "Sem permissão para ver este conteúdo." }, { status: 403 });
  }

  const files = await prisma.genericFileItem.findMany({
    where: scope.kind === "subcategory" ? { subcategoryId: scope.id } : { categoryId: scope.id },
    orderBy: [{ isFolder: "desc" }, { name: "asc" }],
    include: { createdBy: { select: { name: true } } },
  });

  return NextResponse.json({ files });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const scope = await resolveGenericScope({ categoryId: body.categoryId, subcategoryId: body.subcategoryId });
  if (!scope) {
    return NextResponse.json({ error: "Categoria/subcategoria não encontrada." }, { status: 404 });
  }
  if (!(await canAccessGenericScope(session.user.id, scope, "canCreate"))) {
    return NextResponse.json({ error: "Sem permissão para criar conteúdo aqui." }, { status: 403 });
  }

  if (body.fileUrl && !isValidBlobUrl(body.fileUrl)) {
    return NextResponse.json({ error: "URL de arquivo inválida." }, { status: 400 });
  }

  // Se vier `parentId`, a pasta-pai precisa pertencer ao MESMO escopo (categoria/subcategoria) —
  // nunca aceitar aninhar um item criado aqui dentro de uma pasta de outra categoria/subcategoria
  // (um client malicioso/com bug poderia ter acesso de `canCreate` num escopo A e tentar usar o
  // `id` de uma pasta que só existe no escopo B; o novo item ainda ficaria com o escopo A
  // corretamente, mas apareceria "pendurado" numa pasta que a listagem de A nunca traz, corrompendo
  // a árvore). `/api/admin/files` (irmã deste endpoint, FileItem) não tem este cuidado hoje — não é
  // replicado aqui de propósito, é uma melhoria local, não uma correção retroativa daquele.
  if (body.parentId) {
    const parent = await prisma.genericFileItem.findUnique({
      where: { id: body.parentId },
      select: { categoryId: true, subcategoryId: true, isFolder: true },
    });
    const sameScope =
      parent?.isFolder &&
      (scope.kind === "category" ? parent.categoryId === scope.id : parent.subcategoryId === scope.id);
    if (!sameScope) {
      return NextResponse.json({ error: "Pasta de destino inválida." }, { status: 400 });
    }
  }

  const file = await prisma.genericFileItem.create({
    data: {
      name: body.name,
      categoryId: scope.kind === "category" ? scope.id : null,
      subcategoryId: scope.kind === "subcategory" ? scope.id : null,
      parentId: body.parentId || null,
      isFolder: !!body.isFolder,
      fileUrl: body.fileUrl || null,
      mimeType: body.mimeType || null,
      sizeBytes: body.sizeBytes || null,
      createdById: session.user.id,
    },
  });

  return NextResponse.json({ file });
}
