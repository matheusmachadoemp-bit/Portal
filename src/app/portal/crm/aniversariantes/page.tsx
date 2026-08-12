import { PageContainer } from "@/components/page-container";
import { CrmTabs } from "../crm-tabs";
import { AniversariantesClient } from "./aniversariantes-client";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";
import { loadClientesCompletos } from "@/lib/crm-data";
import { computeClienteMetrics, proximoAniversario } from "@/lib/crm";
import { differenceInCalendarDays } from "date-fns";

export default async function AniversariantesPage() {
  const ctx = await getActiveEmpresaContext();
  const empresaIds = ctx ? empresaIdsForContext(ctx) : [];
  const isGrupo = ctx?.mode === "grupo";

  const clientes = await loadClientesCompletos(empresaIds);
  const metrics = computeClienteMetrics(clientes);
  const metricsById = new Map(metrics.map((m) => [m.id, m]));
  const now = new Date();

  const rows = clientes
    .filter((c) => c.dataNascimento)
    .map((c) => {
      const m = metricsById.get(c.id)!;
      const proximo = proximoAniversario(c.dataNascimento!, now);
      return {
        id: c.id,
        nome: c.nome,
        dataNascimento: c.dataNascimento!.toISOString(),
        diasAte: differenceInCalendarDays(proximo, now),
        lojaNome: c.empresa.name,
        lojaColor: c.empresa.color,
        totalGasto: m.totalGasto,
        pedidos: m.pedidos,
        status: m.status,
      };
    })
    .sort((a, b) => a.diasAte - b.diasAte);

  return (
    <PageContainer title="CRM" subtitle="Aniversariantes">
      <div className="space-y-6">
        <CrmTabs />
        <AniversariantesClient rows={rows} isGrupo={isGrupo} />
      </div>
    </PageContainer>
  );
}
