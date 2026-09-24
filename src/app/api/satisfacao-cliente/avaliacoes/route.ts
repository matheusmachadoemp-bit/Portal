import { NextResponse } from "next/server";
import { Prisma, type CustomerSurveyStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";
import { hasModulePermission } from "@/lib/authz";
import { AVALIACAO_FILTRO_TOPO_VALUES, buildFiltroTopoWhere, resolveEmpresaConfigs, type AvaliacaoFiltroTopo } from "@/lib/customer-survey-dashboard";

/** Inteiro >= 1 (opcionalmente limitado a `max`) a partir de um parâmetro de query — mesmo
 *  helper (duplicado de propósito, não existe um compartilhado ainda) já usado em
 *  src/app/api/rh/time-entries/route.ts e src/app/api/tarefas/route.ts. */
function parsePositiveInt(value: string | null, fallback: number, max?: number): number {
  if (value === null) return fallback;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) return fallback;
  return max !== undefined ? Math.min(n, max) : n;
}

const STATUS_VALUES: CustomerSurveyStatus[] = ["NOVA", "EM_ATENDIMENTO", "RESOLVIDA"];

/**
 * Lista de avaliações (seção 11) — sempre paginada (`page`/`pageSize`, 1-indexado, padrão 20,
 * teto 100): este projeto já teve mais de um achado de `findMany` sem `take` esvaziando listas
 * silenciosamente conforme o histórico cresce (ver racional completo em
 * src/lib/customer-survey-dashboard.ts), e diferente das rotas de paginação "opt-in" (RH/
 * Tarefas), esta rota é nova — sem nenhum client legado que dependa do formato sem paginação —
 * então nasce sempre paginada, sem precisar de teto de segurança alternativo.
 *
 * Filtro topo (`filtro`: Todas/Positivas/Neutras/Críticas/Resolvidas/Pendentes, seção 11) +
 * filtros adicionais (período, unidade, garçom, mesa, nota exata, status bruto do enum, busca
 * livre por cliente). `filtro` e `status` são independentes e combináveis (`filtro=criticas` +
 * `status=EM_ATENDIMENTO` = "críticas que já estão sendo tratadas").
 */
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // Módulo "crm" (não "satisfacao-cliente") — ver comentário completo em
  // src/app/portal/satisfacao-cliente/visao-geral/page.tsx.
  if (!(await hasModulePermission(session.user.id, "crm", "canView", "avaliacoes"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite ver as avaliações de Satisfação do Cliente." },
      { status: 403 }
    );
  }

  const ctx = await getActiveEmpresaContext();
  if (!ctx) return NextResponse.json({ error: "Sem acesso a nenhuma loja." }, { status: 403 });
  const contextEmpresaIds = empresaIdsForContext(ctx);

  const { searchParams } = new URL(req.url);

  // "unidade": só restringe DENTRO do que o contexto ativo já permite — nunca aceita uma
  // empresaId fora da lista (mesmo padrão de src/app/api/tarefas/route.ts).
  const empresaIdParam = searchParams.get("empresaId");
  if (empresaIdParam && !contextEmpresaIds.includes(empresaIdParam)) {
    return NextResponse.json({ error: "Loja inválida ou sem acesso." }, { status: 403 });
  }
  const empresaIds = empresaIdParam ? [empresaIdParam] : contextEmpresaIds;

  const filtroParam = searchParams.get("filtro") as AvaliacaoFiltroTopo | null;
  const filtro: AvaliacaoFiltroTopo = filtroParam && AVALIACAO_FILTRO_TOPO_VALUES.includes(filtroParam) ? filtroParam : "todas";

  const statusParam = searchParams.get("status") as CustomerSurveyStatus | null;
  const status = statusParam && STATUS_VALUES.includes(statusParam) ? statusParam : null;

  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const garcomId = searchParams.get("garcomId");
  const mesaId = searchParams.get("mesaId");
  const notaParam = searchParams.get("nota");
  const nota = notaParam !== null && Number.isInteger(Number(notaParam)) ? Number(notaParam) : null;
  const cliente = searchParams.get("cliente")?.trim();

  const configs = await resolveEmpresaConfigs(empresaIds);

  const where: Prisma.CustomerSurveyResponseWhereInput = {
    empresaId: { in: empresaIds },
    ...buildFiltroTopoWhere(filtro, empresaIds, configs),
    ...(status ? { status } : {}),
    ...(from || to
      ? { submittedAt: { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) } }
      : {}),
    ...(garcomId ? { garcomIndicadoId: garcomId } : {}),
    ...(mesaId ? { tableId: mesaId } : {}),
    ...(nota !== null ? { notaGeral: nota } : {}),
    ...(cliente
      ? { OR: [{ nomeInformado: { contains: cliente, mode: "insensitive" } }, { telefoneInformado: { contains: cliente } }] }
      : {}),
  };

  const page = parsePositiveInt(searchParams.get("page"), 1);
  const pageSize = parsePositiveInt(searchParams.get("pageSize"), 20, 100);

  const [avaliacoes, total] = await Promise.all([
    prisma.customerSurveyResponse.findMany({
      where,
      orderBy: { submittedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        cliente: { select: { id: true, nome: true } },
        table: { select: { id: true, numero: true } },
        garcomIndicado: { select: { id: true, name: true } },
        // Só a 1ª resposta "não gostei" com texto — usada como fallback do resumo quando não há
        // `sugestao` (ver mapeamento abaixo). `take` dentro de um `include` de relação 1-N é
        // suportado pelo Prisma — evita carregar TODAS as respostas só pra escolher 1 texto.
        respostas: { where: { valorGostei: false, valorTexto: { not: null } }, select: { valorTexto: true }, take: 1 },
      },
    }),
    prisma.customerSurveyResponse.count({ where }),
  ]);

  return NextResponse.json({
    avaliacoes: avaliacoes.map((a) => ({
      id: a.id,
      empresaId: a.empresaId,
      submittedAt: a.submittedAt.toISOString(),
      cliente: a.cliente ? { id: a.cliente.id, nome: a.cliente.nome } : { id: null, nome: a.nomeInformado },
      mesa: a.table ? { id: a.table.id, numero: a.table.numero } : null,
      garcom: a.garcomIndicado ? { id: a.garcomIndicado.id, nome: a.garcomIndicado.name } : null,
      notaGeral: a.notaGeral,
      critica: a.critica,
      status: a.status,
      // "resumo" da linha: a sugestão do cliente, ou — na ausência dela — o começo do "o que não
      // te agradou" de alguma resposta GOSTEI_NAO_GOSTEI=false com texto (escolha registrada no
      // relatório: entre os dois, a sugestão costuma ser mais informativa quando existe, porque é
      // texto livre sobre a experiência inteira, não só sobre 1 pergunta específica).
      resumo: (a.sugestao?.trim() || a.respostas[0]?.valorTexto || null)?.slice(0, 140) ?? null,
    })),
    pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
  });
}
