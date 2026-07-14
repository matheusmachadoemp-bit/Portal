import { auth } from "@/auth";

export async function requireUser() {
  const session = await auth();
  if (!session?.user) {
    throw new Response("Unauthorized", { status: 401 });
  }
  return session.user;
}

export async function requireAdmin() {
  const user = await requireUser();
  if (user.role !== "ADMINISTRADOR" && user.role !== "GESTOR") {
    throw new Response("Forbidden", { status: 403 });
  }
  return user;
}
