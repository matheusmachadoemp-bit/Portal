import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { applyModuleQuizResult } from "@/lib/university-server";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id: quizId } = await params;

  const quiz = await prisma.trainingQuiz.findUnique({
    where: { id: quizId },
    include: { questions: { include: { options: true } }, module: { include: { lessons: true, course: true } } },
  });
  if (!quiz) return NextResponse.json({ error: "Avaliação não encontrada." }, { status: 404 });

  const enrollment = await prisma.trainingEnrollment.findUnique({
    where: { userId_courseId: { userId: session.user.id, courseId: quiz.module.courseId } },
  });
  if (!enrollment) return NextResponse.json({ error: "Você não está matriculado neste curso." }, { status: 403 });

  const moduleEnrollment = await prisma.trainingModuleEnrollment.findUnique({
    where: { enrollmentId_moduleId: { enrollmentId: enrollment.id, moduleId: quiz.moduleId } },
    include: { lessonProgress: true },
  });
  if (!moduleEnrollment) {
    return NextResponse.json({ error: "Você ainda não começou este módulo." }, { status: 403 });
  }

  // Regra de negócio: avaliação só depois de concluir todas as aulas do
  // módulo — já era assim no player (botão desabilitado), agora também
  // reforçado no servidor, pra não dar pra pular direto pra prova chamando a
  // rota sem passar pela tela.
  const totalLessons = quiz.module.lessons.length;
  const completedLessons = moduleEnrollment.lessonProgress.filter((p) => p.completed).length;
  if (totalLessons === 0 || completedLessons < totalLessons) {
    return NextResponse.json(
      { error: "Conclua todas as aulas do módulo antes de fazer a avaliação." },
      { status: 403 }
    );
  }

  const body = await req.json();
  const answers: { questionId: string; optionId?: string; text?: string }[] = body.answers ?? [];

  const gradable = quiz.questions.filter((q) => q.type !== "DISSERTATIVA");
  let correctCount = 0;
  for (const q of gradable) {
    const answer = answers.find((a) => a.questionId === q.id);
    const correctOption = q.options.find((o) => o.correct);
    if (answer?.optionId && correctOption && answer.optionId === correctOption.id) correctCount++;
  }
  const score = gradable.length ? Math.round((correctCount / gradable.length) * 100) : 100;
  const passed = score >= quiz.minScore;

  // Achado (Nina, auditoria geral): contar as tentativas anteriores e gravar a nova tentativa
  // eram duas operações separadas (count fora de qualquer transação, create depois) — duas
  // requisições simultâneas (ex.: duplo clique, retry de rede) podiam cada uma contar as
  // mesmas N tentativas anteriores (ambas < maxAttempts) e criar sua própria tentativa,
  // passando do número máximo permitido. Agora as duas ficam dentro de uma única transação
  // interativa, travada por um advisory lock do Postgres (`pg_advisory_xact_lock`) escopado a
  // este par quiz+usuário: a segunda chamada concorrente só prossegue depois que a primeira
  // já comitou (ou desfez) sua própria contagem+gravação, então sempre vê a contagem
  // atualizada. O lock é automaticamente liberado no fim da transação — não precisa de
  // nenhuma coluna/migração nova.
  //
  // Achado P4 (Nina): a versão original travava com `hashtext(quizId || userId)` — um único
  // hash de 32 bits sobre a concatenação CRUA dos dois ids, sem separador nem prefixo de
  // domínio, diferente do padrão já estabelecido no resto do projeto (2 chaves de 32 bits via
  // `hashtext('namespace', id)`, ou 1 chave de 64 bits via `hashtextextended('namespace:' + id,
  // 0)` — ver `travarSaldoLojaNord`/src/lib/loja-nord-server.ts, `travarProbabilidadeRoleta` e
  // `travarGiroPorResponse`/src/lib/roulette-server.ts, `src/lib/ficha-autolink.ts`,
  // `src/lib/ficha-nome-server.ts`, `src/lib/bank-sync-server.ts`,
  // `src/lib/bank-reconciliation.ts`, `src/lib/reservas-disponibilidade.ts`). Sem separador,
  // ids concatenados sem delimitador podem colidir entre pares diferentes (ex.: quizId="ab",
  // userId="cd" produz a mesma string que quizId="a", userId="bcd") — risco baixo na prática
  // (hash de 32 bits já tem colisão residual mesmo com separador), mas a inconsistência de
  // estilo com o resto do projeto não tinha motivo. Agora usa 2 chaves de 32 bits, uma por
  // entidade, com prefixo de domínio na primeira — mesmo padrão de `travarProbabilidadeRoleta`/
  // `travarGiroPorResponse`.
  const result = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('quiz_attempt:' || ${quizId}), hashtext(${session.user.id}))`;

    const previousAttempts = await tx.trainingAttempt.count({ where: { quizId, userId: session.user.id } });
    if (previousAttempts >= quiz.maxAttempts) {
      return { ok: false as const };
    }

    const attempt = await tx.trainingAttempt.create({
      data: {
        quizId,
        moduleEnrollmentId: moduleEnrollment.id,
        userId: session.user.id,
        score,
        passed,
        answers: JSON.stringify(answers),
        attemptNumber: previousAttempts + 1,
        submittedAt: new Date(),
      },
    });

    return { ok: true as const, attempt };
  });

  if (!result.ok) {
    return NextResponse.json({ error: "Número máximo de tentativas atingido." }, { status: 400 });
  }

  await applyModuleQuizResult(moduleEnrollment.id, passed, score === 100);

  return NextResponse.json({ attempt: result.attempt });
}
