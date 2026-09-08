import { prisma } from "@/lib/prisma";
import { PageContainer } from "@/components/page-container";
import { CursosClient } from "./cursos-client";

export default async function CursosPage() {
  const courses = await prisma.course.findMany({ orderBy: { createdAt: "desc" } });
  // Segurança: esta renderização inicial no servidor nunca deve mandar
  // senhaCipher pro navegador (nem cru, nem decifrado) — mesmo cuidado já
  // aplicado em GET /api/admin/courses. `senha` fica sempre null aqui;
  // quem precisar do valor de verdade busca sob demanda em
  // GET /api/admin/courses/[id]/senha.
  const serialized = courses.map(({ senhaCipher, ...c }) => ({
    ...c,
    senha: null as string | null,
    hasSenha: !!senhaCipher,
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
