import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { hasModulePermission } from "@/lib/authz";
import { redirect } from "next/navigation";
import { PageContainer } from "@/components/page-container";
import { Badge, ProgressBar, Section } from "@/components/ui/stat-card";
import { levelForXp, nextLevelForXp } from "@/lib/university";
import { canManageUsers } from "@/lib/permissions";
import { Award } from "lucide-react";
import Link from "next/link";
import { format } from "date-fns";

// Subcategoria "Colaboradores" absorveu a antiga subcategoria "Certificados"
// (ver migração 20260915150000_remove_certificados_subcategoria_universidade) —
// as duas telas mostravam informação sobre o mesmo grupo de pessoas
// (progresso de treinamento e certificados emitidos), então viraram duas
// seções de uma tela só em vez de dois itens separados no menu lateral. A
// rota antiga /portal/universidade/certificados agora só redireciona pra cá
// (ver src/app/portal/universidade/certificados/page.tsx).
export default async function ColaboradoresPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!(await hasModulePermission(session.user.id, "universidade", "canView"))) {
    redirect("/portal/inicio");
  }

  const isAdmin = canManageUsers(session.user.role);

  const [users, certificates] = await Promise.all([
    prisma.user.findMany({
      where: isAdmin ? { active: true } : { id: session.user.id },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        role: true,
        avatarUrl: true,
        trainingEnrollments: { select: { status: true } },
        trainingCertificates: { select: { id: true } },
        trainingXpEvents: { select: { amount: true } },
      },
    }),
    prisma.trainingCertificate.findMany({
      where: isAdmin ? {} : { userId: session.user.id },
      orderBy: { issuedAt: "desc" },
      include: {
        user: { select: { name: true } },
        course: { select: { name: true, instructor: true } },
        module: { select: { title: true } },
      },
    }),
  ]);

  const profiles = users.map((u) => {
    const xp = u.trainingXpEvents.reduce((a, e) => a + e.amount, 0);
    const concluidos = u.trainingEnrollments.filter((e) => e.status === "CONCLUIDO").length;
    const pendentes = u.trainingEnrollments.filter((e) => e.status !== "CONCLUIDO").length;
    return {
      id: u.id,
      name: u.name,
      role: u.role,
      xp,
      level: levelForXp(xp),
      concluidos,
      pendentes,
      certificados: u.trainingCertificates.length,
    };
  });

  return (
    <PageContainer title="Universidade Grupo Nord" subtitle="Colaboradores">
      <div className="space-y-6">
        <Section title="Progresso dos colaboradores">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {profiles.map((p) => (
              <div key={p.id} className="nord-card p-4">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <p className="text-white text-sm font-medium">{p.name}</p>
                    <p className="text-xs text-nord-gray">{p.role}</p>
                  </div>
                  <Badge tone="info">{p.level.label}</Badge>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center mb-3">
                  <div>
                    <p className="text-white text-sm font-semibold">{p.concluidos}</p>
                    <p className="text-[10px] text-nord-gray">Concluídos</p>
                  </div>
                  <div>
                    <p className="text-white text-sm font-semibold">{p.pendentes}</p>
                    <p className="text-[10px] text-nord-gray">Pendentes</p>
                  </div>
                  <div>
                    <p className="text-white text-sm font-semibold">{p.certificados}</p>
                    <p className="text-[10px] text-nord-gray">Certificados</p>
                  </div>
                </div>
                {(() => {
                  const next = nextLevelForXp(p.xp);
                  const percent = next
                    ? Math.round(((p.xp - p.level.minXp) / (next.minXp - p.level.minXp)) * 100)
                    : 100;
                  return (
                    <>
                      <p className="text-[11px] text-nord-gray mb-1">
                        {p.xp} XP {next ? `· faltam ${next.minXp - p.xp} XP para ${next.label}` : "· nível máximo"}
                      </p>
                      <ProgressBar percent={percent} color={p.level.color} />
                    </>
                  );
                })()}
              </div>
            ))}
            {profiles.length === 0 && (
              <p className="text-sm text-nord-gray col-span-full text-center py-8">Nenhum colaborador encontrado.</p>
            )}
          </div>
        </Section>

        <Section title="Certificados emitidos">
          {certificates.length === 0 ? (
            <p className="text-sm text-nord-gray text-center py-8">Nenhum certificado emitido ainda.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {certificates.map((c) => (
                <Link
                  key={c.id}
                  href={`/certificado/${c.code}`}
                  target="_blank"
                  className="nord-card p-4 hover:border-nord-blue/50 flex flex-col gap-2"
                >
                  <div className="flex items-center gap-2">
                    <div className="w-9 h-9 rounded-lg bg-amber-500/15 flex items-center justify-center shrink-0">
                      <Award size={18} className="text-amber-400" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-white text-sm font-medium truncate">{c.course.name}</p>
                      <p className="text-xs text-nord-gray truncate">{c.module.title}</p>
                      {isAdmin && <p className="text-xs text-nord-gray truncate">{c.user.name}</p>}
                    </div>
                  </div>
                  <p className="text-xs text-nord-gray">Carga horária: {c.cargaHoraria}min</p>
                  <p className="text-xs text-nord-gray">Emitido em {format(c.issuedAt, "dd/MM/yyyy")}</p>
                  <p className="text-[10px] text-nord-gray/70 font-mono">{c.code}</p>
                </Link>
              ))}
            </div>
          )}
        </Section>
      </div>
    </PageContainer>
  );
}
