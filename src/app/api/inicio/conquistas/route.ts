import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getUserEmpresas } from "@/lib/empresa";
import { verificarEConcederBadges, listarConquistas } from "@/lib/conquistas";

/**
 * "Conquistas" (medalhas) do usuário logado — aberto a QUALQUER perfil
 * logado, mesma regra das demais rotas "individuais" de /api/inicio/* (ex.:
 * /api/inicio/minha-meta, /api/inicio/colaborador-resumo).
 *
 * A cada chamada roda primeiro a checagem-e-concessão dos critérios gerais
 * (src/lib/conquistas.ts, idempotente — não é um cron job, roda sob demanda
 * aqui mesmo) e só depois devolve a lista completa: os badges gerais
 * (`UserBadge`) e os já existentes de treinamento (`TrainingUserBadge`,
 * módulo de Universidade/Cursos), unificados num só formato.
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

  await verificarEConcederBadges(empresaId, userId, nomeUsuario);
  const conquistas = await listarConquistas(userId);

  return NextResponse.json({ conquistas });
}
