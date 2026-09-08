import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getUserEmpresas } from "@/lib/empresa";
import { perfilInicioForRole, loadSetorDoLider, loadColaboradoresDoSetor } from "@/lib/inicio";

/**
 * "Colaboradores" da Tela de Início — painel exclusivo do perfil Líder
 * (403 para os demais perfis: Proprietário/Gerente já têm "Equipe de hoje",
 * GET /api/inicio/equipe-hoje, que é da loja inteira; este aqui é
 * especificamente o setor do Líder).
 *
 * Lista os colaboradores ATIVOS do MESMO setor do usuário logado
 * (`Employee.setor`, texto livre — ver o comentário grande acima de
 * `loadSetorDoLider` em src/lib/inicio.ts para os limites desse
 * cruzamento). Sem ficha de RH ligada (setor não identificado), devolve
 * `{ setor: null, colaboradores: [] }` — nunca um erro.
 */
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const perfil = perfilInicioForRole(session.user.role);
  if (perfil !== "LIDER") {
    return NextResponse.json({ error: "Sem acesso a este painel." }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const empresaId = searchParams.get("empresaId");
  if (!empresaId) {
    return NextResponse.json({ error: "Parâmetro empresaId é obrigatório." }, { status: 400 });
  }

  // Nunca confiar cegamente no empresaId da query string: precisa estar
  // entre as lojas que o usuário logado pode ver (mesma checagem das
  // demais rotas de /api/inicio/*).
  const empresasPermitidas = await getUserEmpresas(session.user.id, session.user.role);
  if (!empresasPermitidas.some((e) => e.id === empresaId)) {
    return NextResponse.json({ error: "Loja inválida ou sem permissão." }, { status: 403 });
  }

  const setor = await loadSetorDoLider(empresaId, session.user.id);
  const colaboradores = setor ? await loadColaboradoresDoSetor(empresaId, setor) : [];

  return NextResponse.json({ setor, colaboradores });
}
