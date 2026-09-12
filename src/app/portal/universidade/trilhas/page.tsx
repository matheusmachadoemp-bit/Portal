import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { hasModulePermission } from "@/lib/authz";
import { PageContainer } from "@/components/page-container";
import { TracksClient } from "./tracks-client";
import { canManageUsers } from "@/lib/permissions";

export default async function TrilhasPage() {
  const session = await auth();
  if (!session?.user || !(await hasModulePermission(session.user.id, "universidade", "canView"))) {
    redirect("/portal/inicio");
  }

  const [tracks, courses, empresas] = await Promise.all([
    prisma.trainingTrack.findMany({
      orderBy: [{ order: "asc" }, { name: "asc" }],
      include: {
        empresa: { select: { name: true } },
        courses: { orderBy: { order: "asc" }, include: { course: { select: { id: true, name: true, cargaHoraria: true, status: true } } } },
      },
    }),
    prisma.trainingCourse.findMany({
      where: { status: "PUBLICADO" },
      select: { id: true, name: true, cargaHoraria: true },
      orderBy: { name: "asc" },
    }),
    prisma.empresa.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { order: "asc" } }),
  ]);

  return (
    <PageContainer title="Universidade Grupo Nord" subtitle="Trilhas de Aprendizagem">
      <TracksClient
        initialTracks={tracks as never}
        allCourses={courses}
        empresas={empresas}
        isAdmin={session ? canManageUsers(session.user.role) : false}
      />
    </PageContainer>
  );
}
