import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";

// Atualiza o próprio perfil (hoje só a foto/avatar). Diferente de PATCH
// /api/usuarios/[id] (que exige ADMIN/GESTOR para editar o perfil de OUTRA
// pessoa), esta rota é para o próprio usuário mexer no seu perfil — mas só
// Administrador pode trocar a própria foto: os demais cargos (Gestor,
// Gerente, Supervisor, Colaborador) não devem conseguir alterar seu avatar
// por aqui. Ver pedido do usuário (item 13 da lista de tarefas).
export async function PATCH(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "ADMINISTRADOR") {
    return NextResponse.json(
      { error: "Apenas Administrador pode trocar a própria foto de perfil." },
      { status: 403 }
    );
  }

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
