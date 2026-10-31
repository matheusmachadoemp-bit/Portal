import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { assertEmpresaAccess } from "@/lib/empresa";
import { hasModulePermission } from "@/lib/authz";

// Mesma trava de `../demitir/route.ts` (ver racional lá): reativar volta a pessoa pro "quadro de
// ativos" (ela passa a contar de novo nas mesmas listagens/contadores que a demissão excluiu), por
// isso fica no mesmo nível restrito — ADMINISTRADOR/GESTOR.
const DISMISS_ROLES = ["ADMINISTRADOR", "GESTOR"];

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!DISMISS_ROLES.includes(session.user.role)) {
    return NextResponse.json(
      { error: "Reativar um colaborador é uma ação restrita a Administrador ou Gestor." },
      { status: 403 }
    );
  }
  const { id } = await params;
  const existing = await prisma.employee.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Não encontrado." }, { status: 404 });
  if (!(await assertEmpresaAccess(session.user.id, session.user.role, existing.empresaId))) {
    return NextResponse.json({ error: "Sem acesso a essa loja." }, { status: 403 });
  }
  if (!(await hasModulePermission(session.user.id, "rh", "canEdit"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite editar colaboradores." },
      { status: 403 }
    );
  }
  if (existing.status !== "DESLIGADO") {
    return NextResponse.json({ error: "Este colaborador não está desligado." }, { status: 400 });
  }

  const employee = await prisma.employee.update({
    where: { id },
    data: { status: "ATIVO", terminationDate: null },
  });

  await prisma.auditLog.create({
    data: {
      userId: session.user.id,
      empresaId: existing.empresaId,
      action: "REATIVAR",
      entityType: "Employee",
      entityId: id,
      before: JSON.stringify({ status: existing.status, terminationDate: existing.terminationDate }),
      after: JSON.stringify({ status: employee.status, terminationDate: employee.terminationDate }),
    },
  });

  return NextResponse.json({ employee });
}
