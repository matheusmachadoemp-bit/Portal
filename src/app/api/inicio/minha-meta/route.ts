import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getUserEmpresas } from "@/lib/empresa";
import { loadMinhaMeta } from "@/lib/inicio";

/**
 * "Minha meta" — painel dedicado à meta individual do colaborador, diferente
 * do alerta resumido que já aparece dentro de "rotina" (`loadRotinaMetas`,
 * usado por GET /api/inicio/rotina): aqui devolvemos a meta completa (ainda
 * que dentro do ritmo esperado), não só um alerta quando ela está atrasada.
 * Aberto a QUALQUER perfil logado, mesma regra das demais rotas
 * "individuais" de /api/inicio/*.
 */
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const empresaId = searchParams.get("empresaId");
  if (!empresaId) {
    return NextResponse.json({ error: "Parâmetro empresaId é obrigatório." }, { status: 400 });
  }

  // Mesma checagem das demais rotas de /api/inicio/*: nunca confiar
  // cegamente no empresaId da query string.
  const empresasPermitidas = await getUserEmpresas(session.user.id, session.user.role);
  if (!empresasPermitidas.some((e) => e.id === empresaId)) {
    return NextResponse.json({ error: "Loja inválida ou sem permissão." }, { status: 403 });
  }

  const userId = session.user.id;
  const nomeUsuario = session.user.name ?? "";

  const meta = await loadMinhaMeta(empresaId, userId, nomeUsuario);

  return NextResponse.json({ meta });
}
