import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getUserEmpresas } from "@/lib/empresa";
import {
  loadRotinaTarefas,
  loadRotinaChecklist,
  loadRotinaMetas,
  loadRotinaPesquisas,
  sortRotinaItems,
} from "@/lib/inicio";

/**
 * "Minha rotina de hoje" — diferente de /api/inicio/indicadores e
 * /api/inicio/desempenho-loja (só Proprietário/Gerente), esta rota é para
 * QUALQUER perfil logado: cada um vê só o que está atribuído a si mesmo
 * (tarefas, checklist, metas individuais e pesquisas de satisfação
 * pendentes) na loja pedida. Não inclui "reuniões" — ver comentário em
 * src/lib/inicio.ts sobre por que essas 4 tabelas não têm como ser
 * filtradas por "hoje".
 */
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const empresaId = searchParams.get("empresaId");
  if (!empresaId) {
    return NextResponse.json({ error: "Parâmetro empresaId é obrigatório." }, { status: 400 });
  }

  // Mesma checagem das rotas de indicadores/desempenho-loja: nunca confiar
  // cegamente no empresaId da query string.
  const empresasPermitidas = await getUserEmpresas(session.user.id, session.user.role);
  const empresa = empresasPermitidas.find((e) => e.id === empresaId);
  if (!empresa) {
    return NextResponse.json({ error: "Loja inválida ou sem permissão." }, { status: 403 });
  }

  const userId = session.user.id;
  const nomeUsuario = session.user.name ?? "";
  const emailUsuario = session.user.email ?? "";

  const [tarefas, checklist, metas, pesquisas] = await Promise.all([
    loadRotinaTarefas(empresaId, userId, empresa.name, nomeUsuario),
    loadRotinaChecklist(empresaId, userId, empresa.name, nomeUsuario),
    loadRotinaMetas(empresaId, empresa.name, nomeUsuario),
    loadRotinaPesquisas(empresaId, emailUsuario, empresa.name, nomeUsuario),
  ]);

  const itens = sortRotinaItems([...tarefas, ...checklist, ...metas, ...pesquisas]);

  return NextResponse.json({ itens });
}
