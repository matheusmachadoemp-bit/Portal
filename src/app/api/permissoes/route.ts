import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { hasModulePermission } from "@/lib/authz";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "ADMINISTRADOR" && session.user.role !== "GESTOR") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!(await hasModulePermission(session.user.id, "usuarios", "canView"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite ver Usuários." },
      { status: 403 }
    );
  }

  const profiles = await prisma.permissionProfile.findMany({
    orderBy: { name: "asc" },
    include: { modulePermissions: true },
  });

  return NextResponse.json({ profiles });
}
