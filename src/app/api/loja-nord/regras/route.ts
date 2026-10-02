import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { p2002ConstraintIncludes } from "@/lib/prisma-errors";
import { getActiveEmpresaContext } from "@/lib/empresa";

/**
 * Regras de pontuação da Loja Nord (tela "Regras de pontuação" e, na Fase 2, a aba de edição em
 * .../loja-nord/gestao). Escrita restrita a ADMINISTRADOR — decisão explícita do Matheus, mais
 * apertada que o catálogo de brindes irmão (`/api/loja-nord/rewards`, que libera GESTOR também).
 * Leitura aberta a qualquer colaborador logado, mesma visibilidade que a tela pública já tinha
 * quando a lista era só a constante estática `LOJA_NORD_DEFAULT_RULES`.
 *
 * Fase 1 desta tarefa é só cadastro + leitura: nenhum crédito/débito automático é aplicado por
 * nenhuma regra aqui ainda (isso é Fase 3, separada, por módulo).
 */

const GATILHOS = ["EVENTO_PONTUAL", "AGREGADO_MENSAL"] as const;

/**
 * Lista as regras. Por padrão só as ativas, filtradas pela loja ativa do usuário — mesmo critério
 * já usado por `LojaNordReward` em `/api/loja-nord/rewards`: `empresaIds` vazio = regra vale pra
 * todas as lojas; no modo "Grupo Nord" consolidado (sem uma única loja ativa) o filtro é pulado e
 * tudo aparece. `?all=1`, só para ADMINISTRADOR, devolve todas as regras (inclusive inativas e
 * restritas a outra loja) — é o que a futura tela de gestão (Fase 2) vai consumir.
 */
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const wantsAll = searchParams.get("all") === "1" && session.user.role === "ADMINISTRADOR";

  if (wantsAll) {
    const rules = await prisma.lojaNordPointRule.findMany({ orderBy: { createdAt: "asc" } });
    return NextResponse.json({ rules });
  }

  const ctx = await getActiveEmpresaContext();
  const empresaId = ctx?.mode === "single" ? ctx.empresa.id : null;

  const now = new Date();
  const rules = await prisma.lojaNordPointRule.findMany({
    where: {
      active: true,
      OR: [{ validoDe: null }, { validoDe: { lte: now } }],
    },
    orderBy: { createdAt: "asc" },
  });
  // `validoAte` não dá pra filtrar na query acima junto com o OR de `validoDe` sem duplicar a
  // condição de "sem data" pros dois campos — mesma situação de `LojaNordReward`
  // (`disponivelDe`/`disponivelAte`) em /api/loja-nord/rewards, que resolve do mesmo jeito: a
  // janela de início vai na query, o fim é filtrado em JS junto com `empresaIds` abaixo.
  const visiveis = rules.filter((r) => {
    if (r.validoAte && r.validoAte < now) return false;
    if (empresaId && r.empresaIds.length > 0 && !r.empresaIds.includes(empresaId)) return false;
    return true;
  });

  return NextResponse.json({ rules: visiveis });
}

/** `LojaNordPointRule` só tem a constraint única `activityType` — qualquer P2002 neste `create`
 *  só pode ser essa, mesmo raciocínio de `isEligibilityConflict` (src/lib/roulette-server.ts):
 *  fallback `true` quando não dá pra confirmar o nome da constraint pelo formato de erro. */
function isActivityTypeConflict(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002" && (p2002ConstraintIncludes(e, "activityType") ?? true);
}

/** Chave estável que o código de integração (Fase 3) vai usar pra casar o evento com a regra —
 *  normaliza pra maiúsculas/underscore e nunca aceita acento/pontuação, pra não deixar nascer uma
 *  regra com chave ambígua (ex.: "Falta" vs "FALTA" vs "Falta " seriam a mesma coisa em qualquer
 *  outro lugar do app, mas contariam como 3 regras diferentes sem essa normalização). */
function normalizeActivityType(raw: string): string {
  return raw
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, "_");
}

/** Cadastra uma regra nova (Administrador). */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "ADMINISTRADOR") {
    return NextResponse.json({ error: "Somente o Administrador pode cadastrar regras de pontuação." }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  if (!body?.activityType?.toString().trim() || !body?.label?.toString().trim() || !Number.isFinite(Number(body?.pontos))) {
    return NextResponse.json(
      { error: "Preencha o tipo de atividade, o nome da regra e a quantidade de pontos." },
      { status: 400 }
    );
  }

  const activityType = normalizeActivityType(String(body.activityType));
  if (!/^[A-Z0-9_]+$/.test(activityType)) {
    return NextResponse.json(
      { error: "O tipo de atividade só pode ter letras, números, espaço ou underscore." },
      { status: 400 }
    );
  }
  const gatilho = body.gatilho ?? "EVENTO_PONTUAL";
  if (!GATILHOS.includes(gatilho)) {
    return NextResponse.json({ error: "Gatilho inválido." }, { status: 400 });
  }

  try {
    const rule = await prisma.lojaNordPointRule.create({
      data: {
        activityType,
        label: String(body.label).trim(),
        pontos: Math.round(Number(body.pontos)),
        gatilho,
        limiteDiario:
          body.limiteDiario === null || body.limiteDiario === "" || body.limiteDiario === undefined
            ? null
            : Math.max(1, Math.round(Number(body.limiteDiario))),
        limiteMensal:
          body.limiteMensal === null || body.limiteMensal === "" || body.limiteMensal === undefined
            ? null
            : Math.max(1, Math.round(Number(body.limiteMensal))),
        exigeValidacao: !!body.exigeValidacao,
        setores: Array.isArray(body.setores) ? body.setores : [],
        empresaIds: Array.isArray(body.empresaIds) ? body.empresaIds : [],
        validoDe: body.validoDe ? new Date(body.validoDe) : null,
        validoAte: body.validoAte ? new Date(body.validoAte) : null,
        active: body.active === undefined ? true : !!body.active,
      },
    });
    return NextResponse.json({ rule });
  } catch (e) {
    if (isActivityTypeConflict(e)) {
      return NextResponse.json({ error: "Já existe uma regra cadastrada para esse tipo de atividade." }, { status: 400 });
    }
    throw e;
  }
}
