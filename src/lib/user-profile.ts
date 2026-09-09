import { auth } from "@/auth";

/**
 * Retorna o perfil do usuário logado a partir da sessão (JWT), sem consultar
 * o banco — usado pelo menu de perfil no topo da tela, que é renderizado em
 * praticamente toda navegação, então uma consulta extra aqui pesa no tempo
 * de carregamento de todo o portal. Nome/e-mail/cargo/foto ficam gravados no
 * token no login (ver `auth.ts`/`auth.config.ts`) e só atualizam na próxima
 * vez que o usuário entrar de novo (ou a cada 8h, quando a sessão expira) —
 * uma pequena defasagem aceitável em troca de não bater no banco a cada
 * clique no menu. Não lança erro quando não há sessão: retorna `null`.
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

  return {
    id: session.user.id,
    name: session.user.name ?? "",
    email: session.user.email ?? "",
    avatarUrl: session.user.avatarUrl,
    role: session.user.role,
  };
}
