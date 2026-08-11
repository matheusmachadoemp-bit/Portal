import { prisma } from "@/lib/prisma";
import { PageContainer } from "@/components/page-container";
import { CrmTabs } from "../crm-tabs";
import { CrmDashboardClient } from "./dashboard-client";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";
import { resolvePeriod } from "@/lib/periods";
import { startOfDay, subDays } from "date-fns";

export default async function CrmDashboardPage() {
  const ctx = await getActiveEmpresaContext();
  const empresaIds = ctx ? empresaIdsForContext(ctx) : [];
  const { from, to } = resolvePeriod("mes");

  const [sales, novosClientes, marketingEntries, baseTotal, clientesUltimos30d] = await Promise.all([
    prisma.sale.findMany({ where: { empresaId: { in: empresaIds }, dateTime: { gte: from, lte: to }, clienteId: { not: null } }, select: { clienteId: true } }),
    prisma.cliente.count({ where: { empresaId: { in: empresaIds }, createdAt: { gte: from, lte: to } } }),
    prisma.marketingEntry.findMany({ where: { empresaId: { in: empresaIds }, date: { gte: from, lte: to } }, select: { visitasSite: true, conversoes: true } }),
    prisma.cliente.count({ where: { empresaId: { in: empresaIds } } }),
    prisma.cliente.findMany({ where: { empresaId: { in: empresaIds }, createdAt: { gte: subDays(new Date(), 30) } }, select: { createdAt: true } }),
  ]);

  const countByCliente = new Map<string, number>();
  for (const s of sales) {
    if (!s.clienteId) continue;
    countByCliente.set(s.clienteId, (countByCliente.get(s.clienteId) ?? 0) + 1);
  }
  const clientesAtivos = countByCliente.size;
  const clientesRecorrentes = [...countByCliente.values()].filter((c) => c >= 2).length;
  const visitasSite = marketingEntries.reduce((sum, m) => sum + m.visitasSite, 0);
  const conversoes = marketingEntries.reduce((sum, m) => sum + m.conversoes, 0);

  const evolucao = Array.from({ length: 30 }, (_, idx) => {
    const day = startOfDay(subDays(new Date(), 29 - idx));
    const count = clientesUltimos30d.filter((c) => startOfDay(c.createdAt).getTime() === day.getTime()).length;
    return { date: day.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }), novosClientes: count };
  });

  return (
    <PageContainer title="CRM" subtitle="Dashboard">
      <div className="space-y-6">
        <CrmTabs />
        <CrmDashboardClient
          initialKey="mes"
          initialSummary={{
            novosClientes,
            clientesAtivos,
            clientesRecorrentes,
            taxaRecorrencia: clientesAtivos ? (clientesRecorrentes / clientesAtivos) * 100 : 0,
            baseTotal,
            visitasSite,
            conversoes,
            taxaConversao: visitasSite ? (conversoes / visitasSite) * 100 : 0,
          }}
          evolucao={evolucao}
        />
      </div>
    </PageContainer>
  );
}
