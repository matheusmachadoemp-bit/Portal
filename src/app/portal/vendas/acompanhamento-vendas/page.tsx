import { PageContainer } from "@/components/page-container";
import { AcompanhamentoClient } from "./acompanhamento-client";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";
import { computeAcompanhamento } from "@/lib/acompanhamento-analytics";
import { resolvePeriod } from "@/lib/periods";
import { format } from "date-fns";

export default async function AcompanhamentoVendasPage() {
  const ctx = await getActiveEmpresaContext();
  const empresaIds = ctx ? empresaIdsForContext(ctx) : [];

  const semanaAtual = resolvePeriod("semana");
  const semanaAnterior = resolvePeriod("semana-anterior");

  const fromA = format(semanaAtual.from, "yyyy-MM-dd");
  const toA = format(semanaAtual.to, "yyyy-MM-dd");
  const fromB = format(semanaAnterior.from, "yyyy-MM-dd");
  const toB = format(semanaAnterior.to, "yyyy-MM-dd");

  const result = await computeAcompanhamento(empresaIds, { fromA, toA, fromB, toB });

  return (
    <PageContainer title="Vendas" subtitle="Acompanhamento de Vendas">
      <div className="space-y-6">
        <AcompanhamentoClient initialResult={result} initialFilters={{ fromA, toA, fromB, toB, turno: "", platform: "" }} />
      </div>
    </PageContainer>
  );
}
