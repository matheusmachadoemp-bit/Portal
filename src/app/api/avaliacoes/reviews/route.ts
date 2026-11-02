import { NextResponse } from "next/server";
import { Prisma, ReviewPlatform, ReviewStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";
import { hasModulePermission } from "@/lib/authz";

/** Inteiro >= 1 (opcionalmente limitado a `max`) — mesmo helper já usado em outras rotas paginadas (ex. src/app/api/satisfacao-cliente/avaliacoes/route.ts). */
function parsePositiveInt(value: string | null, fallback: number, max?: number): number {
  if (value === null) return fallback;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) return fallback;
  return max !== undefined ? Math.min(n, max) : n;
}

// `Object.values(...)` sobre o próprio enum do Prisma (não uma lista literal copiada à mão) de
// propósito — achado do Teulis na revisão: a lista literal de status ficou desatualizada quando
// `SIMULADA` foi adicionado ao enum `ReviewStatus` numa rodada posterior desta mesma tarefa,
// fazendo o filtro `?status=SIMULADA` ser silenciosamente ignorado (nenhum erro, só devolvia
// todas as avaliações). Derivar de `Object.values()` elimina essa classe de bug de vez: um
// valor novo no enum (ex. quando a Fase 2 trouxer o Google) passa a ser aceito aqui
// automaticamente, sem precisar lembrar de atualizar esta lista também.
const STATUS_VALUES: ReviewStatus[] = Object.values(ReviewStatus);
const PLATFORM_VALUES: ReviewPlatform[] = Object.values(ReviewPlatform);

/**
 * Lista de avaliações (tela "Avaliações > Respostas") — sempre paginada (mesmo racional já
 * documentado em src/app/api/satisfacao-cliente/avaliacoes/route.ts: nunca um `findMany` sem
 * `take`). Filtros: status, plataforma (Fase 1 só tem dado com `IFOOD`, mas o filtro já aceita
 * `GOOGLE` para a Fase 2 não precisar de nenhum ajuste aqui) e loja (no modo Grupo Nord).
 */
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModulePermission(session.user.id, "avaliacoes", "canView"))) {
    return NextResponse.json({ error: "Seu perfil de permissão não permite ver as avaliações." }, { status: 403 });
  }

  const ctx = await getActiveEmpresaContext();
  if (!ctx) return NextResponse.json({ error: "Sem acesso a nenhuma loja." }, { status: 403 });
  const contextEmpresaIds = empresaIdsForContext(ctx);

  const { searchParams } = new URL(req.url);

  const empresaIdParam = searchParams.get("empresaId");
  if (empresaIdParam && !contextEmpresaIds.includes(empresaIdParam)) {
    return NextResponse.json({ error: "Loja inválida ou sem acesso." }, { status: 403 });
  }
  const empresaIds = empresaIdParam ? [empresaIdParam] : contextEmpresaIds;

  const statusParam = searchParams.get("status") as ReviewStatus | null;
  const status = statusParam && STATUS_VALUES.includes(statusParam) ? statusParam : null;

  const platformParam = searchParams.get("platform") as ReviewPlatform | null;
  const platform = platformParam && PLATFORM_VALUES.includes(platformParam) ? platformParam : null;

  const page = parsePositiveInt(searchParams.get("page"), 1);
  const pageSize = parsePositiveInt(searchParams.get("pageSize"), 20, 100);

  const where: Prisma.ReviewWhereInput = {
    empresaId: { in: empresaIds },
    ...(status ? { status } : {}),
    ...(platform ? { platform } : {}),
  };

  const [reviews, total] = await Promise.all([
    prisma.review.findMany({
      where,
      orderBy: { reviewDate: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { empresa: { select: { id: true, name: true } } },
    }),
    prisma.review.count({ where }),
  ]);

  return NextResponse.json({
    reviews: reviews.map((r) => ({
      id: r.id,
      empresa: { id: r.empresa.id, name: r.empresa.name },
      platform: r.platform,
      externalReviewId: r.externalReviewId,
      rating: r.rating,
      comment: r.comment,
      customerName: r.customerName,
      reviewDate: r.reviewDate.toISOString(),
      status: r.status,
      generatedReply: r.generatedReply,
      postedReply: r.postedReply,
      repliedAt: r.repliedAt?.toISOString() ?? null,
      errorMessage: r.errorMessage,
    })),
    pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
  });
}
