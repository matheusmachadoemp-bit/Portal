import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getUserEmpresas } from "@/lib/empresa";
import { prisma } from "@/lib/prisma";
import { pct } from "@/lib/calc";
import { differenceInCalendarDays } from "date-fns";
import { perfilInicioForRole, perfilPodeVerAlertas, goalPace, loadSetorDoLider, mapSetorLivreParaGoalCategory } from "@/lib/inicio";
import { currentMonth, monthToDateRange, GOAL_CATEGORY_LABEL, type GoalCategoryKey } from "@/lib/goals";

/**
 * "Progresso das metas" (card da Tela de Início) — só estes 5 setores
 * operacionais, na ordem em que devem aparecer no card. ADMINISTRATIVO (a
 * 6ª categoria de `GoalCategory`, usada pela tela de Metas) fica de fora de
 * propósito: não foi pedida nesta etapa.
 */
const SETORES_INICIO: GoalCategoryKey[] = ["GERENCIA", "SALAO", "COZINHA", "DELIVERY", "MARKETING"];

/**
 * "Progresso das metas" — mesmo grupo de perfis de /api/inicio/alertas
 * (Proprietário, Gerente e Líder; não Colaborador), pela mesma
 * `perfilPodeVerAlertas`. Proprietário/Gerente sempre veem os 5 setores
 * (comportamento inalterado); Líder só vê o(s) setor(es) que baterem com o
 * setor da própria ficha de RH (`loadSetorDoLider` +
 * `mapSetorLivreParaGoalCategory`, em src/lib/inicio.ts — ver o comentário
 * grande lá para os limites desse cruzamento). Sem ficha de RH ligada, ou
 * setor que não bate com nenhuma das 5 categorias, o Líder recebe
 * `{ setores: [] }` — nunca os 5 setores por engano, nunca um erro.
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

  // Mesma checagem das demais rotas de /api/inicio/*: nunca confiar
  // cegamente no empresaId da query string.
  const empresasPermitidas = await getUserEmpresas(session.user.id, session.user.role);
  if (!empresasPermitidas.some((e) => e.id === empresaId)) {
    return NextResponse.json({ error: "Loja inválida ou sem permissão." }, { status: 403 });
  }

  let setoresPermitidos = SETORES_INICIO;
  if (perfil === "LIDER") {
    const setorLivre = await loadSetorDoLider(empresaId, session.user.id);
    const categoria = setorLivre ? mapSetorLivreParaGoalCategory(setorLivre) : null;
    setoresPermitidos = categoria ? [categoria] : [];
  }

  // Toda meta vale por um mês inteiro, do dia 1 ao último dia (ver
  // `monthToDateRange`/`currentMonth` em src/lib/goals.ts — os mesmos
  // helpers que a tela de Metas usa para achar "as metas do mês X" via
  // `dateToMonth(g.startDate) === mes`). Por isso dá pra filtrar direto
  // pelo `startDate` exato do mês corrente, sem reinventar essa checagem.
  const now = new Date();
  const { startDate } = monthToDateRange(currentMonth());

  const goals =
    setoresPermitidos.length === 0
      ? []
      : await prisma.goal.findMany({
          where: { empresaId, category: { in: setoresPermitidos }, startDate: new Date(startDate) },
          orderBy: { createdAt: "asc" },
        });

  // Na prática, cada um dos 5 setores costuma ter no máximo 1 meta cadastrada
  // por mês (é assim que a tela de Metas é usada hoje). Mas o schema permite
  // mais de uma meta na mesma categoria/mês (ex.: uma meta de faturamento e
  // outra de CMV, as duas para o Salão) — nesse caso, em vez de inventar uma
  // forma de somar/mesclar os valores (as metas podem estar em unidades
  // diferentes — R$, %, unidades — então somar seria enganoso), devolvemos
  // TODAS as metas encontradas para o setor, cada uma como uma entrada
  // própria (podendo repetir o mesmo `setor` mais de uma vez). Nunca
  // escondemos uma meta real só para caber em "1 item por setor".
  const setores = setoresPermitidos.flatMap((categoria) =>
    goals
      .filter((g) => g.category === categoria)
      .map((g) => {
        const pace = goalPace(g, now);
        const status = pace.percentMeta >= 100 ? "atingida" : pace.abaixoDoRitmo ? "abaixo_ritmo" : "no_ritmo";

        // Projeção linear simples: mantém o ritmo médio de realização por
        // dia decorrido do mês até o fim do mês. Não existe esse cálculo
        // pronto em nenhum outro lugar do app (a tela em
        // src/app/portal/metas/preview-teste é só um mock visual com dados
        // fictícios) — implementado especificamente para este card.
        const diasTotais = differenceInCalendarDays(g.endDate, g.startDate) + 1;
        const diasDecorridos = Math.min(diasTotais, Math.max(1, differenceInCalendarDays(now, g.startDate) + 1));
        const projecaoFechamento = (g.valorRealizado / diasDecorridos) * diasTotais;

        return {
          setor: GOAL_CATEGORY_LABEL[categoria],
          percentual: pct(g.valorRealizado, g.valorMeta),
          meta: g.valorMeta,
          realizado: g.valorRealizado,
          status,
          responsavel: g.responsavel || null,
          projecaoFechamento,
        };
      })
  );

  return NextResponse.json({ setores });
}
