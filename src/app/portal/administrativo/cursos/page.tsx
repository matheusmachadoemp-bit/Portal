import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { hasModulePermission } from "@/lib/authz";
import { PageContainer } from "@/components/page-container";
import { CursosClient } from "./cursos-client";

// Mesmo cuidado do achado de segurança em senhas/page.tsx: layout.tsx (`/portal/**`) só
// confirma que existe sessão e filtra o MENU lateral — nunca bloqueia a página em si. Sem
// este check, qualquer usuário logado digitando a URL direto recebia o HTML já renderizado
// com todo o conteúdo administrativo. Combina a mesma checagem de cargo já usada pelas rotas
// de API irmãs (`/api/admin/courses/**`, ADMINISTRADOR/GESTOR) com `hasModulePermission` no
// módulo "administrativo" (mesmo padrão de configuracoes/page.tsx): perfil de permissão só
// pode restringir ALÉM do cargo, nunca liberar além dele — por isso o cargo continua sendo
// checado aqui mesmo depois de adicionar o check de perfil.
export default async function CursosPage() {
  const session = await auth();
  if (
    !session?.user ||
    (session.user.role !== "ADMINISTRADOR" && session.user.role !== "GESTOR") ||
    !(await hasModulePermission(session.user.id, "administrativo", "canView"))
  ) {
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
