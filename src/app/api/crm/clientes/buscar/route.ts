import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";
import { hasModulePermission } from "@/lib/authz";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModulePermission(session.user.id, "crm", "canView"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite ver o CRM." },
      { status: 403 }
    );
  }

  const ctx = await getActiveEmpresaContext();
  if (!ctx) return NextResponse.json({ error: "Sem acesso a nenhuma loja." }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim();
  if (!q || q.length < 2) return NextResponse.json({ clientes: [] });

  const clientes = await prisma.cliente.findMany({
    where: {
      empresaId: { in: empresaIdsForContext(ctx) },
      OR: [{ nome: { contains: q, mode: "insensitive" } }, { telefone: { contains: q } }, { whatsapp: { contains: q } }],
    },
    select: { id: true, nome: true, telefone: true },
    take: 8,
  });

  return NextResponse.json({ clientes });
}
