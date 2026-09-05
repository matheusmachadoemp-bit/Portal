import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { invitationState, loadInvitationByToken } from "@/lib/satisfaction-server";

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invitation = await loadInvitationByToken(token);
  const state = invitationState(invitation);

  if (state === "invalido") return NextResponse.json({ state }, { status: 404 });
  if (state !== "ok") return NextResponse.json({ state });

  const survey = invitation!.survey;
  return NextResponse.json({
    state: "ok",
    empresa: invitation!.employee.empresa,
    survey: {
      id: survey.id,
      title: survey.title,
      description: survey.description,
      anonima: survey.anonima,
      permitirComentarioAdicional: survey.permitirComentarioAdicional,
      embaralharPerguntas: survey.embaralharPerguntas,
      exibirResultadoColaborador: survey.exibirResultadoColaborador,
      perguntas: survey.perguntas.map((q) => ({
        id: q.id,
        tipo: q.tipo,
        titulo: q.titulo,
        orientacao: q.orientacao,
        obrigatoria: q.obrigatoria,
        opcoes: q.opcoes.map((o) => ({ id: o.id, texto: o.texto })),
      })),
    },
  });
}

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invitation = await loadInvitationByToken(token);
  const state = invitationState(invitation);
  if (state === "invalido") return NextResponse.json({ error: "Link inválido." }, { status: 404 });
  if (state !== "ok") return NextResponse.json({ error: "Essa pesquisa não aceita mais respostas." }, { status: 400 });

  const body = await req.json();
  const answers: { questionId: string; valorNumero?: number; valorTexto?: string; valorBooleano?: boolean; optionId?: string; optionIds?: string[] }[] =
    body.respostas || [];
  const comentarioAdicional: string | undefined = body.comentarioAdicional;

  const survey = invitation!.survey;
  const answerByQuestion = new Map(answers.map((a) => [a.questionId, a]));
  const faltando = survey.perguntas.filter((q) => q.obrigatoria && !answerByQuestion.get(q.id));
  if (faltando.length > 0) {
    return NextResponse.json({ error: `Responda todas as perguntas obrigatórias: ${faltando.map((q) => q.titulo).join(", ")}.` }, { status: 400 });
  }

  const response = await prisma.satisfactionResponse.create({
    data: {
      surveyId: survey.id,
      empresaId: invitation!.employee.empresaId,
      setor: invitation!.employee.setor,
      comentarioAdicional: comentarioAdicional || null,
      respostas: {
        create: survey.perguntas
          .filter((q) => answerByQuestion.has(q.id))
          .map((q) => {
            const a = answerByQuestion.get(q.id)!;
            return {
              questionId: q.id,
              valorNumero: a.valorNumero ?? null,
              valorTexto: a.valorTexto ?? null,
              valorBooleano: a.valorBooleano ?? null,
              optionId: a.optionId ?? null,
              opcoesMultiplas: a.optionIds?.length
                ? { create: a.optionIds.map((optionId) => ({ optionId })) }
                : undefined,
            };
          }),
      },
    },
  });

  await prisma.satisfactionInvitation.update({
    where: { id: invitation!.id },
    data: { respondido: true, respondidoEm: new Date() },
  });

  return NextResponse.json({ ok: true, responseId: response.id, exibirResultadoColaborador: survey.exibirResultadoColaborador });
}
