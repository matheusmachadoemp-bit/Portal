import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { PageContainer } from "@/components/page-container";
import { CursosClient } from "./cursos-client";

// Mesma checagem de cargo já usada pela API irmã (GET /api/admin/courses): sem ela,
// qualquer usuário autenticado (de qualquer cargo) conseguia ver todos os cursos
// administrativos — inclusive o `usuario` (login da plataforma externa de cada curso) —
// direto nesta página Server Component, já que ela busca via Prisma direto, sem passar
// pela API (achado #229, mesma classe do BUG-004 já corrigido em rh/colaboradores/page.tsx).
export default async function CursosPage() {
  const session = await auth();
  if (!session?.user || (session.user.role !== "ADMINISTRADOR" && session.user.role !== "GESTOR")) {
    redirect("/portal/inicio");
  }

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
