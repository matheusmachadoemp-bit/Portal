import { prisma } from "@/lib/prisma";
import { PageContainer } from "@/components/page-container";
import { getActiveEmpresaContext } from "@/lib/empresa";
import { loadClientesCompletos } from "@/lib/crm-data";
import { computeClienteMetrics, computeAutoSegments } from "@/lib/crm";
import { CampanhaWizard } from "./campanha-wizard";

export default async function NovaCampanhaPage({
  searchParams,
}: {
  searchParams: Promise<{ clientes?: string; autoSegmento?: string; segmentoId?: string }>;
}) {
  const sp = await searchParams;
  const ctx = await getActiveEmpresaContext();

  if (!ctx || ctx.mode !== "single") {
    return (
      <PageContainer title="CRM" subtitle="Nova Campanha" backHref="/portal/crm/campanhas">
        <div className="nord-card p-6 text-center text-sm text-nord-gray">
          Selecione uma loja específica (não o modo Grupo Nord) para criar uma campanha.
        </div>
      </PageContainer>
    );
  }

  const [clientes, segmentosSalvos] = await Promise.all([
    loadClientesCompletos([ctx.empresa.id]),
    prisma.crmSegment.findMany({ where: { empresaId: ctx.empresa.id }, orderBy: { name: "asc" } }),
  ]);
  const metrics = computeClienteMetrics(clientes);
  const autoSegments = computeAutoSegments(clientes, metrics);

  const clienteIdsPreselecionados = sp.clientes ? sp.clientes.split(",").filter(Boolean) : [];
  const clientesPreselecionados = clientes
    .filter((c) => clienteIdsPreselecionados.includes(c.id))
    .map((c) => ({ id: c.id, nome: c.nome }));

  return (
    <PageContainer title="CRM" subtitle="Nova Campanha" backHref="/portal/crm/campanhas" backLabel="Voltar para Campanhas">
      <CampanhaWizard
        autoSegments={autoSegments.map((s) => ({ key: s.key, name: s.name, count: s.count }))}
        segmentosSalvos={segmentosSalvos.map((s) => ({ id: s.id, name: s.name }))}
        totalClientes={clientes.length}
        clientesPreselecionados={clientesPreselecionados}
        initialAudienceType={
          clientesPreselecionados.length > 0 ? "CLIENTES" : sp.autoSegmento || sp.segmentoId ? "SEGMENTO" : "TODOS"
        }
        initialAutoSegmento={sp.autoSegmento ?? null}
        initialSegmentoId={sp.segmentoId ?? null}
      />
    </PageContainer>
  );
}
