import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { PageContainer } from "@/components/page-container";
import { Badge, ProgressBar } from "@/components/ui/stat-card";
import { levelForXp, nextLevelForXp } from "@/lib/university";
import { canManageUsers } from "@/lib/permissions";

export default async function ColaboradoresPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const isAdmin = canManageUsers(session.user.role);

  const users = await prisma.user.findMany({
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
  });

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
          {profiles.length === 0 && <p className="text-sm text-nord-gray col-span-full text-center py-8">Nenhum colaborador encontrado.</p>}
        </div>
      </div>
    </PageContainer>
  );
}
