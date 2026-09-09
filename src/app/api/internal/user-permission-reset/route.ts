import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";

// TEMPORARY, idempotent fix route. Delete after use.
// O bloco "Permissões personalizadas por módulo" da tela Usuários > Novo usuário
// gravava em UserPermission mas nada no sistema lia essa tabela — a permissão
// nunca teve efeito real. Agora que passou a ser aplicada de verdade (ver
// hasModulePermission em @/lib/authz e buildVisibilityResolver em
// @/lib/permissions), qualquer linha salva antes disso é lixo/placebo (valores
// que um admin marcou sem saber que não tinham efeito) — limpa antes que essas
// linhas antigas passem a restringir alguém de surpresa.
export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (session.user.role !== "ADMINISTRADOR" && session.user.role !== "GESTOR") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { count } = await prisma.userPermission.deleteMany({});

  return NextResponse.json({ deleted: count });
}
