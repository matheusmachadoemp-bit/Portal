import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getUserEmpresas } from "@/lib/empresa";
import {
  perfilInicioForRole,
  perfilPodeVerAlertas,
  loadManutencaoResumo,
  loadSetorDoLider,
  type ManutencaoResumo,
} from "@/lib/inicio";

/**
 * "Resumo de manutenção" da Tela de Início — mesma proteção de
 * /api/inicio/alertas (`perfilPodeVerAlertas`: Proprietário, Gerente e
 * Líder; não Colaborador).
 *
 * Os números batem com os mesmos KPIs já mostrados em /portal/manutencao
 * ("Chamados abertos", "Chamados urgentes", "Equipamentos parados") — ver
 * comentário acima de `loadManutencaoResumo` em src/lib/inicio.ts para o
 * detalhe de cada definição e da "próxima manutenção programada".
 *
 * Proprietário/Gerente continuam vendo os números da loja inteira (sem
 * mudança de comportamento). Líder vê só o próprio setor: descobre o setor
 * pela ficha de RH ligada (`loadSetorDoLider`) e passa esse valor para
 * `loadManutencaoResumo`, que filtra `Equipamento.setor`/`Chamado.setor` por
 * ele (ver o comentário grande acima de `loadSetorDoLider`, em
 * src/lib/inicio.ts, para os limites desse cruzamento). Sem setor
 * identificado, devolve o resumo zerado — nunca os números da loja inteira
 * por engano, nunca um erro.
 */
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const perfil = perfilInicioForRole(session.user.role);
  if (!perfilPodeVerAlertas(perfil)) {
    return NextResponse.json({ error: "Sem acesso a este painel." }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const empresaId = searchParams.get("empresaId");
  if (!empresaId) {
    return NextResponse.json({ error: "Parâmetro empresaId é obrigatório." }, { status: 400 });
  }

  // Nunca confiar cegamente no empresaId da query string: precisa estar
  // entre as lojas que o usuário logado pode ver (mesma checagem de
  // src/app/api/inicio/alertas/route.ts).
  const empresasPermitidas = await getUserEmpresas(session.user.id, session.user.role);
  if (!empresasPermitidas.some((e) => e.id === empresaId)) {
    return NextResponse.json({ error: "Loja inválida ou sem permissão." }, { status: 403 });
  }

  if (perfil === "LIDER") {
    const setor = await loadSetorDoLider(empresaId, session.user.id);
    if (!setor) {
      const resumoVazio: ManutencaoResumo = {
        chamadosAbertos: 0,
        chamadosUrgentes: 0,
        equipamentosParados: 0,
        proximaManutencaoProgramada: null,
      };
      return NextResponse.json(resumoVazio);
    }
    const resumo = await loadManutencaoResumo(empresaId, new Date(), setor);
    return NextResponse.json(resumo);
  }

  const resumo = await loadManutencaoResumo(empresaId);
  return NextResponse.json(resumo);
}
