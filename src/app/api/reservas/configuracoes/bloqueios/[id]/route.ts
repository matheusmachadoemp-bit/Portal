import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { requireActiveSingleEmpresa } from "@/lib/empresa";
import { hasModulePermission } from "@/lib/authz";
import { RESERVAS_MANAGER_ROLES } from "@/lib/reservas";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!RESERVAS_MANAGER_ROLES.includes(session.user.role)) {
    return NextResponse.json({ error: "Você não pode alterar as configurações de Reservas." }, { status: 403 });
  }
  if (!(await hasModulePermission(session.user.id, "reservas", "canEdit"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite alterar as configurações de Reservas." },
      { status: 403 }
    );
  }

  const empresa = await requireActiveSingleEmpresa();
  if (!empresa) {
    return NextResponse.json({ error: "Selecione uma loja específica para alterar as configurações." }, { status: 400 });
  }

  const { id } = await params;
  // `deleteMany` com `empresaId` no where (em vez de `delete({ where: { id } })`): garante que
  // uma loja nunca remove o bloqueio de outra loja só adivinhando/reaproveitando um `id` de
  // outra empresa — mesmo cuidado de isolamento entre lojas já aplicado no resto do Portal.
  const result = await prisma.reservationBlockedDate.deleteMany({ where: { id, empresaId: empresa.id } });
  if (result.count === 0) {
    return NextResponse.json({ error: "Bloqueio não encontrado." }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
