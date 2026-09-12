import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";
import { hasModulePermission } from "@/lib/authz";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModulePermission(session.user.id, "marketing", "canView"))) {
    return NextResponse.json({ error: "Seu perfil de permissão não permite ver o Marketing." }, { status: 403 });
  }

  const ctx = await getActiveEmpresaContext();
  if (!ctx) return NextResponse.json({ error: "Sem acesso a nenhuma loja." }, { status: 403 });

  const logs = await prisma.auditLog.findMany({
    where: {
      empresaId: { in: empresaIdsForContext(ctx) },
      entityType: "MarketingTask",
      action: { in: ["CREATE", "STATUS_CHANGE"] },
    },
    orderBy: { createdAt: "desc" },
    take: 300,
    include: { user: { select: { name: true } } },
  });

  const history = logs.map((h) => ({
    id: h.id,
    action: h.action,
    before: h.before,
    after: h.after,
    userName: h.user?.name ?? "Sistema",
    createdAt: h.createdAt.toISOString(),
  }));

  return NextResponse.json({ history });
}
