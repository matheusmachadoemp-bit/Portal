import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { hasModulePermission } from "@/lib/authz";
import { redirect } from "next/navigation";
import { PageContainer } from "@/components/page-container";
import { Section, Badge } from "@/components/ui/stat-card";
import Link from "next/link";
import { format } from "date-fns";

export default async function AvaliacoesPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!(await hasModulePermission(session.user.id, "universidade", "canView"))) {
    redirect("/portal/inicio");
  }

  const [attempts, pendingModuleEnrollments] = await Promise.all([
    prisma.trainingAttempt.findMany({
      where: { userId: session.user.id },
      orderBy: { startedAt: "desc" },
      include: { quiz: { include: { module: { include: { course: { select: { name: true, id: true } } } } } } },
    }),
    // Módulo com todas as aulas assistidas (progressPercent 100) mas ainda
    // sem avaliação aprovada — status só fica EM_ANDAMENTO/REPROVADO nesse
    // ponto quando o módulo tem avaliação (sem avaliação, já teria virado
    // CONCLUIDO automaticamente ao terminar as aulas).
    prisma.trainingModuleEnrollment.findMany({
      where: {
        enrollment: { userId: session.user.id },
        status: { in: ["EM_ANDAMENTO", "REPROVADO"] },
        progressPercent: 100,
      },
      include: { module: { include: { course: { select: { name: true, id: true } }, quiz: true } } },
    }),
  ]);

  const pendingQuizzes = pendingModuleEnrollments.filter((me) => me.module.quiz);

  return (
    <PageContainer title="Universidade Grupo Nord" subtitle="Avaliações">
      <div className="space-y-6">
        {pendingQuizzes.length > 0 && (
          <Section title="Avaliações pendentes">
            <div className="space-y-2">
              {pendingQuizzes.map((me) => (
                <Link
                  key={me.id}
                  href={`/portal/universidade/cursos/${me.module.course.id}`}
                  className="flex items-center justify-between nord-card p-3 hover:border-nord-blue/50"
                >
                  <span className="text-sm text-white">
                    {me.module.course.name} <span className="text-nord-gray">— {me.module.title}</span>
                  </span>
                  <Badge tone="warning">Aguardando avaliação</Badge>
                </Link>
              ))}
            </div>
          </Section>
        )}

        <Section title="Histórico de tentativas">
          {attempts.length === 0 ? (
            <p className="text-sm text-nord-gray text-center py-6">Você ainda não realizou nenhuma avaliação.</p>
          ) : (
            <div className="overflow-x-auto nord-scrollbar">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-nord-gray border-b border-nord-border">
                    <th className="py-2 pr-4">Curso</th>
                    <th className="py-2 pr-4">Módulo</th>
                    <th className="py-2 pr-4">Tentativa</th>
                    <th className="py-2 pr-4">Nota</th>
                    <th className="py-2 pr-4">Resultado</th>
                    <th className="py-2 pr-4">Data</th>
                  </tr>
                </thead>
                <tbody>
                  {attempts.map((a) => (
                    <tr key={a.id} className="border-b border-nord-border/50">
                      <td className="py-2 pr-4 text-white">{a.quiz.module.course.name}</td>
                      <td className="py-2 pr-4 text-nord-gray">{a.quiz.module.title}</td>
                      <td className="py-2 pr-4 text-nord-gray">#{a.attemptNumber}</td>
                      <td className="py-2 pr-4 text-nord-gray">{a.score}%</td>
                      <td className="py-2 pr-4">
                        <Badge tone={a.passed ? "success" : "danger"}>{a.passed ? "Aprovado" : "Reprovado"}</Badge>
                      </td>
                      <td className="py-2 pr-4 text-nord-gray">{format(a.startedAt, "dd/MM/yyyy HH:mm")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>
      </div>
    </PageContainer>
  );
}
