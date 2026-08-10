import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { PageContainer } from "@/components/page-container";
import { UniversityTabs } from "../university-tabs";
import { Section, StatCard, Badge } from "@/components/ui/stat-card";
import { canManageUsers } from "@/lib/permissions";
import { subDays, differenceInDays, format } from "date-fns";

const OVERDUE_DAYS = 7;

export default async function PainelGestorPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!canManageUsers(session.user.role)) redirect("/portal/universidade/dashboard");

  const now = new Date();

  const [enrollments, quizzes] = await Promise.all([
    prisma.trainingEnrollment.findMany({
      include: { user: { select: { name: true } }, course: { select: { name: true, mandatory: true } } },
    }),
    prisma.trainingQuiz.findMany({
      include: { course: { select: { name: true } }, attempts: { select: { score: true } } },
    }),
  ]);

  const concluidos = enrollments.filter((e) => e.status === "CONCLUIDO").length;
  const emAndamento = enrollments.filter((e) => e.status === "EM_ANDAMENTO").length;
  const naoIniciados = enrollments.filter((e) => e.status === "NAO_INICIADO").length;

  const atrasados = enrollments.filter(
    (e) => e.course.mandatory && e.status !== "CONCLUIDO" && e.createdAt <= subDays(now, OVERDUE_DAYS)
  );

  const cursosDificeis = quizzes
    .filter((q) => q.attempts.length > 0)
    .map((q) => ({
      name: q.course.name,
      media: Math.round((q.attempts.reduce((a, at) => a + at.score, 0) / q.attempts.length) * 10) / 10,
      tentativas: q.attempts.length,
    }))
    .sort((a, b) => a.media - b.media)
    .slice(0, 5);

  const tempos = enrollments
    .filter((e) => e.startedAt && e.completedAt)
    .map((e) => differenceInDays(e.completedAt!, e.startedAt!));
  const tempoMedio = tempos.length ? Math.round((tempos.reduce((a, t) => a + t, 0) / tempos.length) * 10) / 10 : 0;

  return (
    <PageContainer title="Universidade Grupo Nord" subtitle="Painel do Gestor">
      <div className="space-y-6">
        <UniversityTabs isAdmin />

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Concluíram" value={String(concluidos)} icon="CheckCircle2" color="#22c55e" />
          <StatCard label="Em andamento" value={String(emAndamento)} icon="Clock" color="#eab308" />
          <StatCard label="Atrasados" value={String(atrasados.length)} icon="AlertTriangle" color="#ef4444" />
          <StatCard label="Não iniciaram" value={String(naoIniciados)} icon="CircleDashed" />
        </div>

        <StatCard label="Tempo médio de treinamento (dias, início até conclusão)" value={`${tempoMedio}`} icon="Timer" />

        <Section title="Colaboradores com pendências (cursos obrigatórios atrasados)">
          {atrasados.length === 0 ? (
            <p className="text-sm text-nord-gray text-center py-6">Nenhum colaborador com pendência no momento. 🎉</p>
          ) : (
            <div className="overflow-x-auto nord-scrollbar">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-nord-gray border-b border-nord-border">
                    <th className="py-2 pr-4">Colaborador</th>
                    <th className="py-2 pr-4">Curso</th>
                    <th className="py-2 pr-4">Status</th>
                    <th className="py-2 pr-4">Atraso</th>
                  </tr>
                </thead>
                <tbody>
                  {atrasados.map((e) => (
                    <tr key={e.id} className="border-b border-nord-border/50">
                      <td className="py-2 pr-4 text-white">{e.user.name}</td>
                      <td className="py-2 pr-4 text-nord-gray">{e.course.name}</td>
                      <td className="py-2 pr-4">
                        <Badge tone="danger">Atrasado</Badge>
                      </td>
                      <td className="py-2 pr-4 text-nord-gray">{differenceInDays(now, e.createdAt)} dias</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>

        <Section title="Cursos mais difíceis (menor nota média nas avaliações)">
          {cursosDificeis.length === 0 ? (
            <p className="text-sm text-nord-gray text-center py-6">Ainda não há avaliações respondidas.</p>
          ) : (
            <div className="space-y-2">
              {cursosDificeis.map((c) => (
                <div key={c.name} className="flex items-center justify-between">
                  <span className="text-sm text-white">{c.name}</span>
                  <span className="text-xs text-nord-gray">Média: {c.media}% · {c.tentativas} tentativa(s)</span>
                </div>
              ))}
            </div>
          )}
        </Section>

        <p className="text-xs text-nord-gray">Dados calculados em {format(now, "dd/MM/yyyy HH:mm")}.</p>
      </div>
    </PageContainer>
  );
}
