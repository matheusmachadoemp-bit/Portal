import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { PRODUCTION_MANAGER_ROLES } from "@/lib/producao-server";
import { hasModulePermission } from "@/lib/authz";

/** Catálogo de setores de produção (ex.: Cozinha Quente/Fria) — mesmo padrão de
 * src/app/api/producao/categorias/route.ts: compartilhado entre lojas (sem
 * empresaId), editável por quem tem permissão de gestão de Produção. */
export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModulePermission(session.user.id, "producao", "canView"))) {
    return NextResponse.json({ error: "Seu perfil de permissão não permite ver a Produção." }, { status: 403 });
  }

  const setores = await prisma.productionSetor.findMany({ orderBy: { order: "asc" } });
  return NextResponse.json({ setores });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!PRODUCTION_MANAGER_ROLES.includes(session.user.role)) {
    return NextResponse.json({ error: "Você não pode cadastrar setores de produção." }, { status: 403 });
  }
  if (!(await hasModulePermission(session.user.id, "producao", "canCreate"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite criar setores de produção." },
      { status: 403 }
    );
  }

  const body = await req.json();
  if (!body.name) return NextResponse.json({ error: "Informe o nome do setor." }, { status: 400 });

  // A key é sempre gerada no servidor (nunca confia na que o cliente mandou) e recebe um sufixo
  // único — mesmo padrão de src/app/api/producao/categorias/route.ts — para nunca esbarrar na
  // unique constraint ao recriar um setor com o mesmo nome (ex.: "Cozinha Quente", já no seed).
  const key = String(body.name)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

  const maxOrder = await prisma.productionSetor.aggregate({ _max: { order: true } });

  const setor = await prisma.productionSetor.create({
    data: {
      key: `${key}-${Date.now().toString(36)}`,
      name: body.name,
      color: body.color || "#2952E3",
      icon: body.icon || "ChefHat",
      order: (maxOrder._max.order ?? 0) + 1,
    },
  });

  return NextResponse.json({ setor });
}
