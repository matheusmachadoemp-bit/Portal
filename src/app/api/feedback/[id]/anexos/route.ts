import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  FEEDBACK_MAX_ATTACHMENTS_PER_REPORT,
  resolveFeedbackAttachment,
  type FeedbackAttachmentInput,
  type ResolvedFeedbackAttachmentData,
} from "@/lib/feedback-server";

/** Mesma janela/limite de `POST /api/feedback` (`FEEDBACK_CREATE_RATE_LIMIT`) — esta rota não
 * tinha NENHUM rate limit antes (achado do Jonas, revisão de segurança desta tarefa), o que
 * permitia anexar em loop sem nenhuma barreira. Chave própria (`feedback-anexo:`), independente
 * do limite de criação de relato. */
const FEEDBACK_ANEXO_RATE_LIMIT = { windowMs: 10_000, max: 3 };

/**
 * POST — adiciona anexo(s) a um relato já existente (upload em si acontece antes, via
 * `/api/upload` genérico do Portal — Vercel Blob; esta rota só registra a URL resultante no
 * Prisma, mesmo padrão de `POST /api/manutencao/chamados` com `anexos` inline). Também aceita
 * `anexos` direto no corpo de `POST /api/feedback` na criação — esta rota cobre o caso de
 * anexar evidência DEPOIS, ou de a Fase 2 (Caio) preferir separar envio de texto e anexo em duas
 * chamadas.
 *
 * Quem pode anexar: quem criou o relato, ou um Administrador (mesmo critério de quem pode
 * acessar o painel administrativo) — ninguém mais deveria conseguir anexar arquivo num relato
 * alheio.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const withinLimit = await checkRateLimit(`feedback-anexo:${session.user.id}`, FEEDBACK_ANEXO_RATE_LIMIT);
  if (!withinLimit) {
    return NextResponse.json({ error: "Aguarde alguns segundos antes de enviar outro anexo." }, { status: 429 });
  }

  const { id } = await params;
  const report = await prisma.feedbackReport.findUnique({
    where: { id },
    select: { id: true, usuarioCriadorId: true, _count: { select: { anexos: true } } },
  });
  if (!report) return NextResponse.json({ error: "Relato não encontrado." }, { status: 404 });

  const canAttach = report.usuarioCriadorId === session.user.id || session.user.role === "ADMINISTRADOR";
  if (!canAttach) return NextResponse.json({ error: "Você não pode anexar arquivos a este relato." }, { status: 403 });

  const body = await req.json().catch(() => null);
  const anexosRaw: FeedbackAttachmentInput[] = Array.isArray(body?.anexos) ? body.anexos : [];
  if (anexosRaw.length === 0) return NextResponse.json({ error: "Nenhum anexo informado." }, { status: 400 });

  if (report._count.anexos + anexosRaw.length > FEEDBACK_MAX_ATTACHMENTS_PER_REPORT) {
    return NextResponse.json(
      { error: `Este relato já atingiu o limite de ${FEEDBACK_MAX_ATTACHMENTS_PER_REPORT} anexos.` },
      { status: 400 }
    );
  }

  const resolvedAnexos: ResolvedFeedbackAttachmentData[] = [];
  for (const a of anexosRaw) {
    const resolved = await resolveFeedbackAttachment(a, session.user.id);
    if (!resolved.ok) return NextResponse.json({ error: resolved.error }, { status: 400 });
    resolvedAnexos.push(resolved.data);
  }

  await prisma.feedbackAttachment.createMany({
    data: resolvedAnexos.map((a) => ({ ...a, feedbackReportId: id })),
  });

  const createdAnexos = await prisma.feedbackAttachment.findMany({
    where: { feedbackReportId: id },
    orderBy: { createdAt: "desc" },
    take: resolvedAnexos.length,
  });

  return NextResponse.json({ anexos: createdAnexos }, { status: 201 });
}
