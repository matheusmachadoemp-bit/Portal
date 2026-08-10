import { prisma } from "@/lib/prisma";
import { PageContainer } from "@/components/page-container";
import { MarketingTabs } from "../marketing-tabs";
import { Section, Badge, ProgressBar } from "@/components/ui/stat-card";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";

export default async function EquipePage() {
  const ctx = await getActiveEmpresaContext();
  const empresaIds = ctx ? empresaIdsForContext(ctx) : [];

  const tasks = await prisma.marketingTask.findMany({
    where: { empresaId: { in: empresaIds }, responsavelId: { not: null } },
    include: { responsavel: { select: { id: true, name: true, role: true, avatarUrl: true } } },
  });

  const byUser = new Map<string, { name: string; role: string; tasks: typeof tasks }>();
  for (const t of tasks) {
    if (!t.responsavel) continue;
    if (!byUser.has(t.responsavel.id)) {
      byUser.set(t.responsavel.id, { name: t.responsavel.name, role: t.responsavel.role, tasks: [] });
    }
    byUser.get(t.responsavel.id)!.tasks.push(t);
  }

  const members = [...byUser.entries()].map(([id, data]) => {
    const total = data.tasks.length;
    const done = data.tasks.filter((t) => t.status === "PUBLICADO" || t.status === "RESULTADOS").length;
    const late = data.tasks.filter(
      (t) => t.date && t.date < new Date() && t.status !== "PUBLICADO" && t.status !== "RESULTADOS"
    ).length;
    return { id, name: data.name, role: data.role, total, done, late, progress: total ? Math.round((done / total) * 100) : 0 };
  });

  return (
    <PageContainer title="Marketing" subtitle="Equipe">
      <div className="space-y-6">
        <MarketingTabs />
        <Section title="Carga de trabalho por responsável">
          {members.length === 0 ? (
            <p className="text-sm text-nord-gray text-center py-8">Nenhuma tarefa atribuída a membros da equipe ainda.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {members.map((m) => (
                <div key={m.id} className="nord-card p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <p className="text-white text-sm font-medium">{m.name}</p>
                      <p className="text-xs text-nord-gray">{m.role}</p>
                    </div>
                    {m.late > 0 && <Badge tone="danger">{m.late} atrasada(s)</Badge>}
                  </div>
                  <div className="flex items-center justify-between text-xs text-nord-gray mb-1.5">
                    <span>{m.done}/{m.total} concluídas</span>
                    <span>{m.progress}%</span>
                  </div>
                  <ProgressBar percent={m.progress} />
                </div>
              ))}
            </div>
          )}
        </Section>
      </div>
    </PageContainer>
  );
}
