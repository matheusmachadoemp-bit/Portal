import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";
import {
  SATISFACTION_MIN_GROUP_SIZE,
  SATISFACTION_SCORABLE_TYPES,
  computeENPS,
  scorableValueToPercent,
} from "@/lib/satisfaction";
import type { SatisfactionTheme } from "@prisma/client";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ctx = await getActiveEmpresaContext();
  if (!ctx) return NextResponse.json({ error: "Sem acesso a nenhuma loja." }, { status: 403 });
  const empresaIds = empresaIdsForContext(ctx);

  const { id } = await params;
  const survey = await prisma.satisfactionSurvey.findFirst({
    where: { id, publico: { some: { empresaId: { in: empresaIds } } } },
    include: {
      perguntas: { where: { ativo: true }, orderBy: { ordem: "asc" } },
    },
  });
  if (!survey) return NextResponse.json({ error: "Pesquisa não encontrada." }, { status: 404 });

  const [totalInvitations, responses] = await Promise.all([
    prisma.satisfactionInvitation.count({ where: { surveyId: id } }),
    prisma.satisfactionResponse.findMany({
      where: { surveyId: id },
      include: { respostas: true },
    }),
  ]);

  const questionById = new Map(survey.perguntas.map((q) => [q.id, q]));
  const totalResponses = responses.length;
  const participacaoPercent = totalInvitations > 0 ? Math.round((totalResponses / totalInvitations) * 100) : null;

  // eNPS geral: todas as respostas de perguntas tipo ENPS.
  const notasEnps: number[] = [];
  for (const r of responses) {
    for (const a of r.respostas) {
      const q = questionById.get(a.questionId);
      if (q?.tipo === "ENPS" && a.valorNumero != null) notasEnps.push(a.valorNumero);
    }
  }
  const enpsGeral = computeENPS(notasEnps);

  // Satisfação geral: média de todas as perguntas "escaláveis" (eNPS, avaliação, sim/não), normalizadas 0-100.
  const scoresGerais: number[] = [];
  for (const r of responses) {
    for (const a of r.respostas) {
      const q = questionById.get(a.questionId);
      if (!q || !SATISFACTION_SCORABLE_TYPES.includes(q.tipo)) continue;
      const pct = scorableValueToPercent(q.tipo, a.valorNumero, a.valorBooleano);
      if (pct != null) scoresGerais.push(pct);
    }
  }
  const satisfacaoGeralPercent =
    scoresGerais.length > 0 ? Math.round(scoresGerais.reduce((s, v) => s + v, 0) / scoresGerais.length) : null;

  // Agrupamento por setor.
  const setorGroups = new Map<string, { total: number; notasEnps: number[]; scores: number[] }>();
  for (const r of responses) {
    const setor = r.setor ?? "Sem setor";
    if (!setorGroups.has(setor)) setorGroups.set(setor, { total: 0, notasEnps: [], scores: [] });
    const group = setorGroups.get(setor)!;
    group.total += 1;
    for (const a of r.respostas) {
      const q = questionById.get(a.questionId);
      if (!q) continue;
      if (q.tipo === "ENPS" && a.valorNumero != null) group.notasEnps.push(a.valorNumero);
      if (SATISFACTION_SCORABLE_TYPES.includes(q.tipo)) {
        const pct = scorableValueToPercent(q.tipo, a.valorNumero, a.valorBooleano);
        if (pct != null) group.scores.push(pct);
      }
    }
  }
  const porSetor = Array.from(setorGroups.entries()).map(([setor, group]) => {
    const protegido = group.total < SATISFACTION_MIN_GROUP_SIZE;
    return {
      setor,
      totalRespostas: group.total,
      protegido,
      enps: protegido ? null : computeENPS(group.notasEnps).enps,
      satisfacaoPercent:
        protegido || group.scores.length === 0
          ? null
          : Math.round(group.scores.reduce((s, v) => s + v, 0) / group.scores.length),
    };
  });

  // Agrupamento por tema.
  const temaGroups = new Map<SatisfactionTheme, number[]>();
  for (const r of responses) {
    for (const a of r.respostas) {
      const q = questionById.get(a.questionId);
      if (!q?.tema || !SATISFACTION_SCORABLE_TYPES.includes(q.tipo)) continue;
      const pct = scorableValueToPercent(q.tipo, a.valorNumero, a.valorBooleano);
      if (pct == null) continue;
      if (!temaGroups.has(q.tema)) temaGroups.set(q.tema, []);
      temaGroups.get(q.tema)!.push(pct);
    }
  }
  const porTema = Array.from(temaGroups.entries()).map(([tema, scores]) => ({
    tema,
    satisfacaoPercent: Math.round(scores.reduce((s, v) => s + v, 0) / scores.length),
    total: scores.length,
  }));

  // Comentários anônimos: respostas ABERTA + comentário adicional, só quando o setor tem >= SATISFACTION_MIN_GROUP_SIZE respostas.
  const comentarios: { id: string; setor: string; tema: SatisfactionTheme | null; texto: string }[] = [];
  const setoresOcultados = new Set<string>();
  for (const r of responses) {
    const setor = r.setor ?? "Sem setor";
    const grupo = setorGroups.get(setor);
    const protegido = !grupo || grupo.total < SATISFACTION_MIN_GROUP_SIZE;
    if (protegido) {
      setoresOcultados.add(setor);
      continue;
    }
    if (r.comentarioAdicional?.trim()) {
      comentarios.push({ id: `${r.id}-adicional`, setor, tema: null, texto: r.comentarioAdicional.trim() });
    }
    for (const a of r.respostas) {
      const q = questionById.get(a.questionId);
      if (q?.tipo === "ABERTA" && a.valorTexto?.trim()) {
        comentarios.push({ id: a.id, setor, tema: q.tema ?? null, texto: a.valorTexto.trim() });
      }
    }
  }

  // Alertas críticos: eNPS negativo ou satisfação < 50%, só para grupos não protegidos.
  const alerts = porSetor
    .filter((g) => !g.protegido && ((g.enps != null && g.enps < 0) || (g.satisfacaoPercent != null && g.satisfacaoPercent < 50)))
    .map((g) => ({
      setor: g.setor,
      enps: g.enps,
      satisfacaoPercent: g.satisfacaoPercent,
      mensagem:
        g.enps != null && g.enps < 0
          ? `${g.setor}: eNPS negativo (${g.enps})`
          : `${g.setor}: satisfação abaixo do esperado (${g.satisfacaoPercent}%)`,
    }));

  return NextResponse.json({
    totalInvitations,
    totalResponses,
    participacaoPercent,
    enpsGeral,
    satisfacaoGeralPercent,
    porSetor,
    porTema,
    comentarios,
    setoresOcultados: Array.from(setoresOcultados),
    alerts,
  });
}
