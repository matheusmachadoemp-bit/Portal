import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { hasModulePermission } from "@/lib/authz";
import { p2002ConstraintIncludes } from "@/lib/prisma-errors";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModulePermission(session.user.id, "estoque", "canView"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite ver o Estoque." },
      { status: 403 }
    );
  }

  const sectors = await prisma.stockSector.findMany({ orderBy: { order: "asc" } });
  return NextResponse.json({ sectors });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModulePermission(session.user.id, "estoque", "canCreate"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite criar setores de estoque." },
      { status: 403 }
    );
  }

  const body = await req.json();
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) return NextResponse.json({ error: "Informe o nome do setor." }, { status: 400 });

  const maxOrder = await prisma.stockSector.aggregate({ _max: { order: true } });

  try {
    const sector = await prisma.stockSector.create({
      data: { name, order: (maxOrder._max.order ?? 0) + 1 },
    });
    return NextResponse.json({ sector });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002" && (p2002ConstraintIncludes(e, "name") ?? true)) {
      return NextResponse.json({ error: "Já existe um setor com esse nome." }, { status: 400 });
    }
    throw e;
  }
}
