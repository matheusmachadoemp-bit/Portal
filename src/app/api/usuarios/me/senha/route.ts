import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import bcrypt from "bcryptjs";

// Troca a própria senha, informando a senha atual — diferente de
// PATCH /api/usuarios/[id], que é só para ADMIN/GESTOR trocarem a senha de
// qualquer usuário (sem exigir a senha atual).
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const senhaAtual = typeof body?.senhaAtual === "string" ? body.senhaAtual : "";
  const novaSenha = typeof body?.novaSenha === "string" ? body.novaSenha : "";

  if (novaSenha.length < 6) {
    return NextResponse.json(
      { error: "A nova senha precisa ter pelo menos 6 caracteres." },
      { status: 400 },
    );
  }

  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const senhaValida = await bcrypt.compare(senhaAtual, user.passwordHash);
  if (!senhaValida) {
    return NextResponse.json({ error: "Senha atual incorreta." }, { status: 400 });
  }

  const passwordHash = await bcrypt.hash(novaSenha, 10);
  await prisma.user.update({
    where: { id: session.user.id },
    data: { passwordHash },
  });

  return NextResponse.json({ ok: true });
}
