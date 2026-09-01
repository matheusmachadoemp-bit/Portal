import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { MENU_CATEGORIES_TAG } from "@/lib/menu-categories";

// TEMPORARY, ONE-OFF ROUTE. A aba "Google Drive" do Marketing virou um
// gerenciador de arquivos nativo (igual à Biblioteca de Arquivos) e o
// usuário decidiu que não faz mais sentido manter as duas separadas.
// Move qualquer arquivo já enviado no espaço "drive" para "biblioteca" e
// remove a subcategoria "Google Drive" do menu lateral (isSystem, por
// isso a rota normal de exclusão bloqueia). Protegida por sessão
// ADMINISTRADOR/GESTOR. Apagar depois de usar.

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "ADMINISTRADOR" && session.user.role !== "GESTOR") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const apply = searchParams.get("apply") === "1";

  const driveFiles = await prisma.marketingFile.findMany({
    where: { space: "drive" },
    select: { id: true, name: true },
  });

  const category = await prisma.category.findUnique({ where: { key: "marketing" } });
  const sub = category
    ? await prisma.subcategory.findUnique({ where: { categoryId_key: { categoryId: category.id, key: "drive" } } })
    : null;

  if (apply) {
    if (driveFiles.length > 0) {
      await prisma.marketingFile.updateMany({ where: { space: "drive" }, data: { space: "biblioteca" } });
    }
    if (sub) {
      await prisma.subcategory.delete({ where: { id: sub.id } });
    }
    revalidateTag(MENU_CATEGORIES_TAG, { expire: 0 });
  }

  return NextResponse.json({
    apply,
    arquivosMovidos: driveFiles.map((f) => f.name),
    subcategoriaEncontrada: !!sub,
  });
}
