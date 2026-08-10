import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { PageContainer } from "@/components/page-container";
import { UniversityTabs } from "../university-tabs";
import { Section, Badge, ProgressBar } from "@/components/ui/stat-card";
import { PlayCircle } from "lucide-react";
import Link from "next/link";
import { ENROLLMENT_STATUS_OPTIONS } from "@/lib/university";

export default async function VideoaulasPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const enrollments = await prisma.trainingEnrollment.findMany({
    where: { userId: session.user.id },
    orderBy: { updatedAt: "desc" },
    include: { course: { include: { modules: { select: { id: true } } } } },
  });

  const emAndamento = enrollments.filter((e) => e.status === "EM_ANDAMENTO" || e.status === "REPROVADO");
  const naoIniciado = enrollments.filter((e) => e.status === "NAO_INICIADO");
  const concluidos = enrollments.filter((e) => e.status === "CONCLUIDO");

  return (
    <PageContainer title="Universidade Grupo Nord" subtitle="Videoaulas">
      <div className="space-y-6">
        <UniversityTabs />

        <Section title="Continuar assistindo">
          {emAndamento.length === 0 ? (
            <p className="text-sm text-nord-gray text-center py-6">
              Nenhuma videoaula em andamento.{" "}
              <Link href="/portal/universidade/cursos" className="text-nord-blue-light hover:text-white">
                Explore o catálogo de cursos
              </Link>
              .
            </p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {emAndamento.map((e) => {
                const statusOpt = ENROLLMENT_STATUS_OPTIONS.find((s) => s.key === e.status);
                return (
                  <Link key={e.id} href={`/portal/universidade/cursos/${e.courseId}`} className="nord-card p-3 hover:border-nord-blue/50 block">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-white text-sm font-medium flex items-center gap-1.5">
                        <PlayCircle size={14} className="text-nord-blue-light" /> {e.course.name}
                      </p>
                      <Badge tone={statusOpt?.tone ?? "default"}>{statusOpt?.label}</Badge>
                    </div>
                    <ProgressBar percent={e.progressPercent} />
                    <p className="text-[11px] text-nord-gray mt-1">{e.progressPercent}% concluído · {e.course.modules.length} aula(s)</p>
                  </Link>
                );
              })}
            </div>
          )}
        </Section>

        {naoIniciado.length > 0 && (
          <Section title="Matriculado — não iniciado">
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {naoIniciado.map((e) => (
                <Link key={e.id} href={`/portal/universidade/cursos/${e.courseId}`} className="nord-card p-3 hover:border-nord-blue/50 block">
                  <p className="text-white text-sm font-medium">{e.course.name}</p>
                  <p className="text-[11px] text-nord-gray mt-1">{e.course.modules.length} aula(s)</p>
                </Link>
              ))}
            </div>
          </Section>
        )}

        <Section title="Concluídos">
          {concluidos.length === 0 ? (
            <p className="text-sm text-nord-gray text-center py-6">Nenhuma videoaula concluída ainda.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {concluidos.map((e) => (
                <Link key={e.id} href={`/portal/universidade/cursos/${e.courseId}`} className="nord-card p-3 hover:border-nord-blue/50 block">
                  <p className="text-white text-sm font-medium">{e.course.name}</p>
                  <Badge tone="success">Concluído</Badge>
                </Link>
              ))}
            </div>
          )}
        </Section>
      </div>
    </PageContainer>
  );
}
