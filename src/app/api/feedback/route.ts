import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { getActiveEmpresaContext } from "@/lib/empresa";
import { hasModulePermission } from "@/lib/authz";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  FEEDBACK_CREATE_RATE_LIMIT,
  FEEDBACK_CREATE_RATE_LIMIT_HOURLY,
  FEEDBACK_DESCRICAO_MAX_LENGTH,
  FEEDBACK_MAX_ATTACHMENTS_PER_REPORT,
  FEEDBACK_STATUS_INICIAL,
  buildFeedbackMetadata,
  buildFeedbackWhere,
  derivePrioridadeInicial,
  findPossibleDuplicate,
  generateFeedbackProtocolo,
  notifyFeedbackAdminsOnCreate,
  resolveFeedbackAttachment,
  resolveModuloAfetado,
  type ResolvedFeedbackAttachmentData,
} from "@/lib/feedback-server";
import type { FeedbackCategoriaProblema, FeedbackImpacto, FeedbackTipo } from "@prisma/client";

const FEEDBACK_LIST_INCLUDE = {
  usuarioCriador: { select: { id: true, name: true, email: true } },
  responsavel: { select: { id: true, name: true } },
  empresa: { select: { id: true, name: true, color: true } },
  categoria: { select: { id: true, name: true } },
  subcategoria: { select: { id: true, name: true, category: { select: { name: true } } } },
  _count: { select: { anexos: true, comentarios: true } },
} as const;

const TITULO_MAX_LENGTH = 120;
const CATEGORIAS_PROBLEMA: FeedbackCategoriaProblema[] = [
  "FUNCIONALIDADE_NAO_FUNCIONA",
  "INFORMACOES_INCORRETAS",
  "ERRO_VISUAL",
  "LENTIDAO",
  "TRAVAMENTO",
  "PROBLEMA_ACESSO",
  "ERRO_AO_SALVAR",
  "OUTRO",
];
const IMPACTOS: FeedbackImpacto[] = ["BAIXO", "MEDIO", "ALTO", "CRITICO"];

/**
 * GET — listagem administrativa (admin only: Role ADMINISTRADOR + `canView` no módulo
 * `bugs-melhorias`). Filtros: tipo, status, prioridade, módulo (categoriaId/subcategoriaId),
 * usuário, período, busca livre (protocolo/título/descrição). Paginação simples (`take`/`skip`)
 * pra não devolver a tabela inteira de uma vez conforme ela cresce.
 */
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "ADMINISTRADOR" || !(await hasModulePermission(session.user.id, "bugs-melhorias", "canView"))) {
    return NextResponse.json({ error: "Sem permissão para acessar a Central de Bugs e Melhorias." }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from") ? new Date(searchParams.get("from") as string) : null;
  const to = searchParams.get("to") ? new Date(searchParams.get("to") as string) : null;
  const where = buildFeedbackWhere({
    tipo: searchParams.get("tipo"),
    status: searchParams.get("status"),
    prioridade: searchParams.get("prioridade"),
    categoriaId: searchParams.get("categoriaId"),
    subcategoriaId: searchParams.get("subcategoriaId"),
    usuarioCriadorId: searchParams.get("usuarioCriadorId"),
    empresaId: searchParams.get("empresaId"),
    from,
    to,
    q: searchParams.get("q"),
  });

  const take = Math.min(Number(searchParams.get("take")) || 50, 300);
  const skip = Math.max(Number(searchParams.get("skip")) || 0, 0);

  const [reports, total] = await Promise.all([
    prisma.feedbackReport.findMany({ where, orderBy: { createdAt: "desc" }, include: FEEDBACK_LIST_INCLUDE, take, skip }),
    prisma.feedbackReport.count({ where }),
  ]);

  return NextResponse.json({ reports, total });
}

/**
 * POST — criar relato (qualquer usuário autenticado, sem checagem de permissão de módulo — ver
 * decisão no CLAUDE.md/relatório da tarefa). Fluxo: valida campos conforme tipo, resolve o
 * "módulo afetado" (Category/Subcategory dinâmico ou texto livre), roda a checagem de
 * duplicidade simples (nunca bloqueia), gera o protocolo e cria tudo dentro de uma transação, e
 * só então notifica os administradores. Nunca responde sucesso antes de persistir de verdade.
 */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Dois limites compostos — ver comentário de `FEEDBACK_CREATE_RATE_LIMIT_HOURLY`
  // (src/lib/feedback-server.ts): o de 10s barra duplo clique, o de 1h barra abuso sustentado
  // (um script automatizado respeitando só o limite de 10s).
  const withinBurstLimit = await checkRateLimit(`feedback-create:${session.user.id}`, FEEDBACK_CREATE_RATE_LIMIT);
  if (!withinBurstLimit) {
    return NextResponse.json(
      { error: "Aguarde alguns segundos antes de enviar outro relato." },
      { status: 429 }
    );
  }
  const withinHourlyLimit = await checkRateLimit(`feedback-create-hourly:${session.user.id}`, FEEDBACK_CREATE_RATE_LIMIT_HOURLY);
  if (!withinHourlyLimit) {
    return NextResponse.json(
      { error: "Você atingiu o limite de relatos por hora. Tente novamente mais tarde." },
      { status: 429 }
    );
  }

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Corpo da requisição inválido." }, { status: 400 });

  const tipo: FeedbackTipo = body.tipo === "SUGESTAO" ? "SUGESTAO" : body.tipo === "BUG" ? "BUG" : (null as never);
  if (!tipo) return NextResponse.json({ error: "Informe se é um bug ou uma sugestão." }, { status: 400 });

  const titulo = String(body.titulo ?? "").trim();
  const descricao = String(body.descricao ?? "").trim();
  if (!titulo) return NextResponse.json({ error: "Informe um título." }, { status: 400 });
  if (titulo.length > TITULO_MAX_LENGTH) {
    return NextResponse.json({ error: `O título pode ter no máximo ${TITULO_MAX_LENGTH} caracteres.` }, { status: 400 });
  }
  if (!descricao) return NextResponse.json({ error: "Descreva o problema ou a sugestão." }, { status: 400 });
  if (descricao.length > FEEDBACK_DESCRICAO_MAX_LENGTH) {
    return NextResponse.json(
      { error: `A descrição pode ter no máximo ${FEEDBACK_DESCRICAO_MAX_LENGTH} caracteres.` },
      { status: 400 }
    );
  }

  let categoriaProblema: FeedbackCategoriaProblema | null = null;
  let impacto: FeedbackImpacto | null = null;
  let beneficioEsperado: string | null = null;

  if (tipo === "BUG") {
    if (!CATEGORIAS_PROBLEMA.includes(body.categoriaProblema)) {
      return NextResponse.json({ error: "Selecione a categoria do problema." }, { status: 400 });
    }
    if (!IMPACTOS.includes(body.impacto)) {
      return NextResponse.json({ error: "Selecione o impacto do problema." }, { status: 400 });
    }
    categoriaProblema = body.categoriaProblema;
    impacto = body.impacto;
  } else {
    beneficioEsperado = body.beneficioEsperado ? String(body.beneficioEsperado).trim().slice(0, 2000) || null : null;
  }

  const moduloResolved = await resolveModuloAfetado({
    categoriaId: body.categoriaId,
    subcategoriaId: body.subcategoriaId,
    moduloAfetadoTexto: body.moduloAfetadoTexto,
  });
  if (!moduloResolved.ok) return NextResponse.json({ error: moduloResolved.error }, { status: 400 });
  const modulo = moduloResolved.value;

  const anexosRaw = Array.isArray(body.anexos) ? body.anexos : [];
  if (anexosRaw.length > FEEDBACK_MAX_ATTACHMENTS_PER_REPORT) {
    return NextResponse.json(
      { error: `No máximo ${FEEDBACK_MAX_ATTACHMENTS_PER_REPORT} anexos por relato.` },
      { status: 400 }
    );
  }
  // Resolvido (validado + confirmado de verdade no Blob via head()) ANTES da transação —
  // `resolveFeedbackAttachment` faz uma chamada de rede, nunca deveria rodar dentro de uma
  // transação de banco aberta.
  const resolvedAnexos: ResolvedFeedbackAttachmentData[] = [];
  for (const a of anexosRaw) {
    const resolved = await resolveFeedbackAttachment(a, session.user.id);
    if (!resolved.ok) return NextResponse.json({ error: resolved.error }, { status: 400 });
    resolvedAnexos.push(resolved.data);
  }

  // Loja do usuário no momento do envio, quando houver uma loja ativa específica — opcional de
  // propósito (ver comentário de `FeedbackReport.empresaId`, schema.prisma): um relato sobre o
  // Portal em si continua visível para Administradores de qualquer loja.
  const ctx = await getActiveEmpresaContext();
  const empresaId = ctx?.mode === "single" ? ctx.empresa.id : null;

  const metadados = buildFeedbackMetadata(req, body.rotaOrigem);
  const possivelDuplicataDeId = await findPossibleDuplicate({
    tipo,
    titulo,
    descricao,
    categoriaId: modulo.categoriaId,
    subcategoriaId: modulo.subcategoriaId,
    moduloAfetadoTexto: modulo.moduloAfetadoTexto,
  });

  const report = await prisma.$transaction(async (tx) => {
    const protocolo = await generateFeedbackProtocolo(tx, tipo);
    const created = await tx.feedbackReport.create({
      data: {
        protocolo,
        tipo,
        titulo,
        descricao,
        categoriaId: modulo.categoriaId,
        subcategoriaId: modulo.subcategoriaId,
        moduloAfetadoTexto: modulo.moduloAfetadoTexto,
        categoriaProblema,
        impacto,
        beneficioEsperado,
        prioridade: derivePrioridadeInicial(tipo, impacto),
        status: FEEDBACK_STATUS_INICIAL[tipo],
        usuarioCriadorId: session.user.id,
        empresaId,
        metadados: metadados as unknown as object,
        possivelDuplicataDeId,
      },
    });
    if (resolvedAnexos.length > 0) {
      await tx.feedbackAttachment.createMany({
        data: resolvedAnexos.map((a) => ({ ...a, feedbackReportId: created.id })),
      });
    }
    return tx.feedbackReport.findUniqueOrThrow({ where: { id: created.id }, include: FEEDBACK_LIST_INCLUDE });
  });

  await notifyFeedbackAdminsOnCreate({ id: report.id, protocolo: report.protocolo, titulo: report.titulo, tipo, impacto });

  // A sinalização de duplicidade é pro ADMINISTRADOR avaliar (ver FeedbackReport.
  // possivelDuplicataDeId, schema.prisma) — nunca pro próprio usuário que está reportando, que
  // não tem motivo pra saber o id de um relato de outra pessoa. `possivelDuplicataDeId` fica
  // gravado no banco normalmente; só não volta na resposta HTTP desta rota (achado do Jonas,
  // revisão de segurança desta tarefa).
  const { possivelDuplicataDeId: _omit, ...reportSemDuplicata } = report;
  void _omit;

  return NextResponse.json({ report: reportSemDuplicata }, { status: 201 });
}
