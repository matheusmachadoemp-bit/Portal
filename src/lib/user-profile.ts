import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

/**
 * Retorna o perfil (dado fresco do banco, não só o que está no token/sessão)
 * do usuário logado — usado pelo menu de perfil no topo da tela. Não lança
 * erro quando não há sessão: retorna `null` nesse caso.
 */
export async function getCurrentUserProfile(): Promise<{
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  role: string;
} | null> {
  const session = await auth();
  if (!session?.user?.id) return null;

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, name: true, email: true, avatarUrl: true, role: true },
  });
  if (!user) return null;

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    avatarUrl: user.avatarUrl,
    role: user.role,
  };
}
