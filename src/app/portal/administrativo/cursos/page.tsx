import { prisma } from "@/lib/prisma";
import { PageContainer } from "@/components/page-container";
import { CursosClient } from "./cursos-client";

export default async function CursosPage() {
  const courses = await prisma.course.findMany({ orderBy: { createdAt: "desc" } });
  const serialized = courses.map((c) => ({
    ...c,
    startDate: c.startDate ? c.startDate.toISOString() : null,
    prazo: c.prazo ? c.prazo.toISOString() : null,
  }));

  return (
    <PageContainer title="Administrativo" subtitle="Cursos e capacitações">
      <div className="space-y-6">
        <CursosClient initialCourses={serialized} />
      </div>
    </PageContainer>
  );
}
