import { prisma } from "@/lib/prisma";
import { PageContainer } from "@/components/page-container";
import { UniversityTabs } from "../university-tabs";
import { Section, Badge } from "@/components/ui/stat-card";
import { levelForXp } from "@/lib/university";
import { Trophy, Medal } from "lucide-react";

export default async function RankingPage() {
  const [xpByUser, certificatesByUser, hoursByUser] = await Promise.all([
    prisma.trainingXpEvent.groupBy({ by: ["userId"], _sum: { amount: true } }),
    prisma.trainingCertificate.groupBy({ by: ["userId"], _count: { id: true } }),
    prisma.trainingModuleProgress.findMany({
      include: { enrollment: { select: { userId: true } } },
    }),
  ]);

  const users = await prisma.user.findMany({
    where: { id: { in: xpByUser.map((x) => x.userId) } },
    select: { id: true, name: true, role: true },
  });
  const nameById = new Map(users.map((u) => [u.id, u]));

  const hoursMap = new Map<string, number>();
  for (const p of hoursByUser) {
    const uid = p.enrollment.userId;
    hoursMap.set(uid, (hoursMap.get(uid) ?? 0) + p.watchedSeconds);
  }
  const certMap = new Map(certificatesByUser.map((c) => [c.userId, c._count.id]));

  const ranking = xpByUser
    .map((x) => ({
      userId: x.userId,
      name: nameById.get(x.userId)?.name ?? "—",
      role: nameById.get(x.userId)?.role ?? "",
      xp: x._sum.amount ?? 0,
      certificados: certMap.get(x.userId) ?? 0,
      horas: Math.round((hoursMap.get(x.userId) ?? 0) / 3600),
    }))
    .sort((a, b) => b.xp - a.xp);

  const top10 = ranking.slice(0, 10);
  const medalColors = ["#eab308", "#94a3b8", "#b45309"];

  return (
    <PageContainer title="Universidade Grupo Nord" subtitle="Ranking">
      <div className="space-y-6">
        <UniversityTabs />

        <Section title="Top 10 colaboradores — experiência (XP)">
          {top10.length === 0 ? (
            <p className="text-sm text-nord-gray text-center py-8">Ninguém pontuou ainda. Complete um curso para entrar no ranking!</p>
          ) : (
            <div className="space-y-2">
              {top10.map((r, idx) => {
                const level = levelForXp(r.xp);
                return (
                  <div key={r.userId} className="flex items-center gap-3 nord-card p-3">
                    <div className="w-8 text-center">
                      {idx < 3 ? (
                        <Trophy size={18} style={{ color: medalColors[idx] }} className="mx-auto" />
                      ) : (
                        <span className="text-nord-gray text-sm font-semibold">{idx + 1}º</span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-sm font-medium truncate">{r.name}</p>
                      <p className="text-xs text-nord-gray">{r.role}</p>
                    </div>
                    <div className="text-right hidden sm:block">
                      <p className="text-xs text-nord-gray">{r.horas}h estudadas</p>
                      <p className="text-xs text-nord-gray">{r.certificados} certificado(s)</p>
                    </div>
                    <Badge tone="info">{level.label}</Badge>
                    <span className="text-white text-sm font-semibold w-16 text-right">{r.xp} XP</span>
                  </div>
                );
              })}
            </div>
          )}
        </Section>

        <Section title="Sistema de níveis">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {[
              { key: "BRONZE", label: "Bronze", minXp: 0, color: "#b45309" },
              { key: "PRATA", label: "Prata", minXp: 300, color: "#94a3b8" },
              { key: "OURO", label: "Ouro", minXp: 800, color: "#eab308" },
              { key: "DIAMANTE", label: "Diamante", minXp: 1800, color: "#38bdf8" },
              { key: "MESTRE_NORD", label: "Mestre Nord", minXp: 3500, color: "#a855f7" },
            ].map((l) => (
              <div key={l.key} className="nord-card p-3 text-center">
                <Medal size={20} style={{ color: l.color }} className="mx-auto mb-1.5" />
                <p className="text-white text-xs font-medium">{l.label}</p>
                <p className="text-[10px] text-nord-gray">{l.minXp}+ XP</p>
              </div>
            ))}
          </div>
        </Section>
      </div>
    </PageContainer>
  );
}
