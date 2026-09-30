import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { requireActiveSingleEmpresa } from "@/lib/empresa";
import { hasModulePermission } from "@/lib/authz";
import {
  adminPrizeWhereExcludingSentinela,
  somaProbabilidadeAtivos,
  validarProbabilidadeAtiva,
  travarProbabilidadeRoleta,
  ProbabilidadeInvalidaError,
} from "@/lib/roulette-server";

/**
 * Catálogo de prêmios da Roleta (`RoulettePrize`) da loja ativa — mesmo formato de catálogo
 * configurável por loja já usado por `GET /api/satisfacao-cliente/perguntas`, mas sem a UNION
 * compartilhada/própria de lá: prêmio de roleta é sempre da própria loja, não existe um catálogo
 * "compartilhado entre todas as lojas" para isso (faria pouco sentido — estoque/quantidadeGanha
 * são inerentemente por loja).
 *
 * A linha-sentinela "Tente novamente" (ver src/lib/roulette-server.ts) nunca aparece aqui —
 * `adminPrizeWhereExcludingSentinela` já filtra por id.
 *
 * `somaProbabilidadeAtivos` vem junto na resposta pra a futura tela do Caio poder mostrar "quanto
 * já está distribuído / quanto ainda cabe" sem precisar somar no client.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModulePermission(session.user.id, "satisfacao-cliente", "canView", "roleta"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite ver os prêmios da Roleta." },
      { status: 403 }
    );
  }

  const empresa = await requireActiveSingleEmpresa();
  if (!empresa) {
    return NextResponse.json(
      { error: "Selecione uma loja específica (não é possível gerenciar a Roleta no modo Grupo Nord)." },
      { status: 400 }
    );
  }

  const [premios, somaAtivos] = await Promise.all([
    prisma.roulettePrize.findMany({
      where: adminPrizeWhereExcludingSentinela(empresa.id),
      orderBy: { ordem: "asc" },
    }),
    somaProbabilidadeAtivos(empresa.id),
  ]);

  return NextResponse.json({ premios, somaProbabilidadeAtivos: somaAtivos });
}

/**
 * Cria um prêmio novo na loja ativa. `probabilidadePercent` é obrigatório e é sempre validado
 * contra o restante do catálogo ATIVO da loja (ver `validarProbabilidadeAtiva` — soma dos ativos
 * nunca pode passar de 100; a folga até 100, se houver, vira a chance implícita de "Tente
 * novamente" no sorteio, ver src/lib/roulette-server.ts) — só quando o prêmio já nasce `ativo`
 * (o padrão): um prêmio criado já desativado não compete pelo orçamento de probabilidade até ser
 * ativado de verdade (ver PATCH).
 *
 * Validação + criação rodam dentro da MESMA transação, travada por `travarProbabilidadeRoleta`
 * (achado #354 da Fase 6: sem isso, duas criações concorrentes na mesma loja podiam ler a mesma
 * soma "ainda cabe" e as duas passarem, ultrapassando 100% juntas) — ver comentário da função no
 * lib. `ProbabilidadeInvalidaError` é a forma de a validação abortar a transação (rollback, sem
 * criar nada) e ainda assim devolver a MESMA mensagem de erro de sempre pro cliente.
 */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModulePermission(session.user.id, "satisfacao-cliente", "canCreate", "roleta"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite criar prêmios da Roleta." },
      { status: 403 }
    );
  }

  const empresa = await requireActiveSingleEmpresa();
  if (!empresa) {
    return NextResponse.json(
      { error: "Selecione uma loja específica (não é possível criar prêmios da Roleta no modo Grupo Nord)." },
      { status: 400 }
    );
  }

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Corpo inválido." }, { status: 400 });

  const nome = String(body.nome ?? "").trim();
  if (!nome) return NextResponse.json({ error: "Informe o nome do prêmio." }, { status: 400 });

  const probabilidadePercent = Number(body.probabilidadePercent);
  if (!Number.isFinite(probabilidadePercent)) {
    return NextResponse.json({ error: "Informe a probabilidade (%) do prêmio." }, { status: 400 });
  }

  const ativo = body.ativo !== false;

  let quantidadeDisponivel: number | null = null;
  if (body.quantidadeDisponivel !== undefined && body.quantidadeDisponivel !== null && body.quantidadeDisponivel !== "") {
    const qtd = Number(body.quantidadeDisponivel);
    if (!Number.isInteger(qtd) || qtd < 0) {
      return NextResponse.json({ error: "Quantidade disponível deve ser um número inteiro, ou deixe em branco para sem limite." }, { status: 400 });
    }
    quantidadeDisponivel = qtd;
  }

  let validadeDias = 30;
  if (body.validadeDias !== undefined) {
    const dias = Number(body.validadeDias);
    if (!Number.isInteger(dias) || dias <= 0) {
      return NextResponse.json({ error: "Validade (em dias) deve ser um número inteiro maior que zero." }, { status: 400 });
    }
    validadeDias = dias;
  }

  let ordem: number;
  if (Number.isFinite(body.ordem)) {
    ordem = Math.round(body.ordem);
  } else {
    const maxOrdem = await prisma.roulettePrize.aggregate({
      where: adminPrizeWhereExcludingSentinela(empresa.id),
      _max: { ordem: true },
    });
    ordem = (maxOrdem._max.ordem ?? -1) + 1;
  }

  let premio;
  try {
    premio = await prisma.$transaction(async (tx) => {
      if (ativo) {
        // Trava a concorrência de validação/gravação de probabilidade desta loja ANTES de
        // conferir o orçamento (ver `travarProbabilidadeRoleta`) — evita 2 criações concorrentes
        // lendo a mesma soma "ainda cabe" e as duas passando, juntas ultrapassando 100%.
        await travarProbabilidadeRoleta(tx, empresa.id);
        const erro = await validarProbabilidadeAtiva(empresa.id, probabilidadePercent, undefined, tx);
        if (erro) throw new ProbabilidadeInvalidaError(erro);
      }
      return tx.roulettePrize.create({
        data: {
          empresaId: empresa.id,
          nome,
          descricao: body.descricao ? String(body.descricao).trim() : null,
          imagemUrl: body.imagemUrl ? String(body.imagemUrl).trim() : null,
          icone: body.icone ? String(body.icone).trim() : null,
          quantidadeDisponivel,
          probabilidadePercent,
          validadeDias,
          ativo,
          ordem,
        },
      });
    });
  } catch (e) {
    if (e instanceof ProbabilidadeInvalidaError) return NextResponse.json({ error: e.message }, { status: 400 });
    throw e;
  }

  return NextResponse.json({ premio });
}
