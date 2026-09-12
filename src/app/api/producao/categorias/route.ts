import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { PRODUCTION_MANAGER_ROLES } from "@/lib/producao-server";
import { hasModulePermission } from "@/lib/authz";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModulePermission(session.user.id, "producao", "canView"))) {
    return NextResponse.json({ error: "Seu perfil de permissão não permite ver a Produção." }, { status: 403 });
  }

  const categorias = await prisma.productionCategory.findMany({ orderBy: { order: "asc" } });
  return NextResponse.json({ categorias });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!PRODUCTION_MANAGER_ROLES.includes(session.user.role)) {
    return NextResponse.json({ error: "Você não pode cadastrar categorias de produção." }, { status: 403 });
  }
  if (!(await hasModulePermission(session.user.id, "producao", "canCreate"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite criar categorias de produção." },
      { status: 403 }
    );
  }

  const body = await req.json();
  if (!body.name || !body.key) {
    return NextResponse.json({ error: "Nome e chave são obrigatórios." }, { status: 400 });
  }

  const count = await prisma.productionCategory.count();
  const categoria = await prisma.productionCategory.create({
    data: {
      key: body.key,
      name: body.name,
      color: body.color || "#2952E3",
      icon: body.icon || "ChefHat",
      order: count,
    },
  });

  return NextResponse.json({ categoria });
}
