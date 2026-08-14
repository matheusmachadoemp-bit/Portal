import { prisma } from "@/lib/prisma";
import { PageContainer } from "@/components/page-container";
import { CrmTabs } from "../crm-tabs";
import { AutomacoesClient } from "./automacoes-client";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";
import { loadClientesCompletos } from "@/lib/crm-data";
import { computeClienteMetrics, computeAutomationMatchCount, AUTOMATION_TEMPLATES, type AutomationTriggerKey } from "@/lib/crm";

export default async function AutomacoesPage() {
  const ctx = await getActiveEmpresaContext();
  const empresaIds = ctx ? empresaIdsForContext(ctx) : [];

  const [clientes, automacoesSalvas] = await Promise.all([
    loadClientesCompletos(empresaIds),
    prisma.automation.findMany({ where: { empresaId: { in: empresaIds } }, orderBy: { createdAt: "desc" } }),
  ]);
  const metrics = computeClienteMetrics(clientes);

  const templates = AUTOMATION_TEMPLATES.map((t) => ({
    ...t,
    matchCount: computeAutomationMatchCount(t.trigger, metrics),
    existing: automacoesSalvas.find((a) => a.trigger === t.trigger) ?? null,
  }));

  const custom = automacoesSalvas
    .filter((a) => !AUTOMATION_TEMPLATES.some((t) => t.trigger === a.trigger && t.name === a.name))
    .map((a) => ({
      id: a.id,
      name: a.name,
      trigger: a.trigger as AutomationTriggerKey,
      waitDays: a.waitDays,
      actionType: a.actionType,
      message: a.message,
      active: a.active,
      matchCount: computeAutomationMatchCount(a.trigger as AutomationTriggerKey, metrics),
    }));

  return (
    <PageContainer title="CRM" subtitle="Automações">
      <div className="space-y-6">
        <CrmTabs />
        <AutomacoesClient templates={templates} custom={custom} canCreate={ctx?.mode === "single"} />
      </div>
    </PageContainer>
  );
}
