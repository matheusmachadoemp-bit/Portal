import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";

// Atualiza o próprio perfil (hoje só a foto/avatar). Qualquer usuário logado
// pode chamar essa rota para si mesmo — diferente de PATCH /api/usuarios/[id],
// que exige ADMIN/GESTOR para editar o perfil de outra pessoa.
export async function PATCH(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const avatarUrl = body?.avatarUrl;
  if (typeof avatarUrl !== "string" || !avatarUrl.trim()) {
    return NextResponse.json({ error: "avatarUrl é obrigatório." }, { status: 400 });
  }

  await prisma.user.update({
    where: { id: session.user.id },
    data: { avatarUrl },
  });

  return NextResponse.json({ ok: true });
}
