import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { getActiveEmpresaContext, requireActiveSingleEmpresa } from "@/lib/empresa";
import { hasModulePermission } from "@/lib/authz";
import { periodoLabel, proximoMesPeriodo } from "@/lib/reuniao";

const PERIODO_REGEX = /^\d{4}-(0[1-9]|1[0-2])$/;

/**
 * Card "Metas de [nome do próximo mês]" da Reunião Gerente (logo abaixo de
 * "Observações da reunião") — lista de metas cadastradas para um mês-alvo
 * (`periodo`, "AAAA-MM"), cada uma com métrica, valor-alvo, prêmio em R$ e
 * destinatário do prêmio. Mesmo mecanismo de permissão do resto da Reunião
 * Gerente (moduleKey "reuniao" — não existe um moduleKey separado por
 * sub-reunião neste projeto).
 *
 * GET lista as metas de um período (default: o próximo mês a partir de hoje,
 * `proximoMesPeriodo()` — nunca digitado). POST cria uma meta nova nesse
 * período. Editar/excluir uma meta específica é em
 * /api/reuniao/gerente/metas-proximo-mes/[id].
 *
 * Em modo "Grupo Nord" (múltiplas lojas ao mesmo tempo) devolve lista vazia —
 * mesmo critério já usado por `current`/`customIndicators` em
 * /api/reuniao/gerente: metas premiam uma equipe de UMA loja específica, não
 * faz sentido misturar metas de lojas diferentes numa visão consolidada.
 */
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModulePermission(session.user.id, "reuniao", "canView"))) {
    return NextResponse.json({ error: "Seu perfil de permissão não permite ver a Reunião." }, { status: 403 });
  }

  const ctx = await getActiveEmpresaContext();
  if (!ctx) return NextResponse.json({ error: "Sem acesso a nenhuma loja." }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const periodoParam = searchParams.get("periodo");
  const periodo = periodoParam && PERIODO_REGEX.test(periodoParam) ? periodoParam : proximoMesPeriodo();

  const metas =
    ctx.mode === "single"
      ? await prisma.metaProximoMes.findMany({
          where: { empresaId: ctx.empresa.id, periodo },
          orderBy: [{ order: "asc" }, { createdAt: "asc" }],
          include: { createdBy: { select: { name: true } } },
        })
      : [];

  return NextResponse.json({ metas, periodo, periodoLabel: periodoLabel(periodo) });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModulePermission(session.user.id, "reuniao", "canCreate"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite cadastrar metas na Reunião Gerente." },
      { status: 403 }
    );
  }

  const empresa = await requireActiveSingleEmpresa();
  if (!empresa) {
    return NextResponse.json(
      { error: "Selecione uma loja específica (não é possível cadastrar metas no modo Grupo Nord)." },
      { status: 400 }
    );
  }

  const body = await req.json();

  const periodo = body.periodo ? String(body.periodo).trim() : proximoMesPeriodo();
  if (!PERIODO_REGEX.test(periodo)) {
    return NextResponse.json({ error: "Período inválido (use o formato AAAA-MM)." }, { status: 400 });
  }

  const metrica = String(body.metrica ?? "").trim();
  if (!metrica) {
    return NextResponse.json({ error: "Informe a métrica da meta (ex.: CMV, Tempo Pedido)." }, { status: 400 });
  }

  const valorAlvo = String(body.valorAlvo ?? "").trim();
  if (!valorAlvo) {
    return NextResponse.json({ error: "Informe o valor-alvo da meta (ex.: 35%, 15min)." }, { status: 400 });
  }

  const valorPremio = Number(body.valorPremio) || 0;
  const destinatarioRaw = typeof body.destinatario === "string" ? body.destinatario.trim() : "";
  const destinatario = destinatarioRaw || "Equipe";

  // Sempre no fim da lista daquele período — mesma lógica de
  // createReuniaoCustomIndicator (max order + 1), pra preservar a ordem de
  // cadastro do usuário na tela e no PDF.
  const maxOrder = await prisma.metaProximoMes.aggregate({
    where: { empresaId: empresa.id, periodo },
    _max: { order: true },
  });

  const meta = await prisma.metaProximoMes.create({
    data: {
      empresaId: empresa.id,
      periodo,
      metrica,
      valorAlvo,
      valorPremio,
      destinatario,
      order: (maxOrder._max.order ?? 0) + 1,
      createdById: session.user.id,
    },
    include: { createdBy: { select: { name: true } } },
  });

  return NextResponse.json({ meta });
}
