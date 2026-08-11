import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "ADMINISTRADOR" && session.user.role !== "GESTOR") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const profile = await prisma.permissionProfile.findUnique({ where: { id } });
  if (!profile) return NextResponse.json({ error: "Perfil não encontrado." }, { status: 404 });

  const body = await req.json();
  const modulePermissions = (body.modulePermissions ?? []) as {
    moduleKey: string;
    canView: boolean;
    canCreate: boolean;
    canEdit: boolean;
    canDelete: boolean;
  }[];

  await prisma.$transaction(
    modulePermissions.map((m) =>
      prisma.modulePermission.upsert({
        where: { profileId_moduleKey: { profileId: id, moduleKey: m.moduleKey } },
        update: { canView: !!m.canView, canCreate: !!m.canCreate, canEdit: !!m.canEdit, canDelete: !!m.canDelete },
        create: {
          profileId: id,
          moduleKey: m.moduleKey,
          canView: !!m.canView,
          canCreate: !!m.canCreate,
          canEdit: !!m.canEdit,
          canDelete: !!m.canDelete,
        },
      })
    )
  );

  return NextResponse.json({ ok: true });
}
