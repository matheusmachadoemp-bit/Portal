import { PageContainer } from "@/components/page-container";
import { FinanceTabs } from "../finance-tabs";
import { computeDre } from "@/lib/dre";
import { DreClient } from "./dre-client";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";

export default async function DrePage() {
  const now = new Date();
  const ctx = await getActiveEmpresaContext();
  const empresaIds = ctx ? empresaIdsForContext(ctx) : [];
  const rows = await computeDre({ month: now.getMonth() + 1, year: now.getFullYear(), empresaIds });

  const monthlyEvolution = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const r = await computeDre({ month: d.getMonth() + 1, year: d.getFullYear(), empresaIds });
    monthlyEvolution.push({
      month: d.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" }),
      faturamento: r.find((x) => x.key === "faturamentos")?.value ?? 0,
      lucroLiquido: r.find((x) => x.key === "lucro-liquido")?.value ?? 0,
    });
  }

  const comparison =
    ctx?.mode === "grupo"
      ? await Promise.all(
          ctx.empresas.map(async (empresa) => {
            const r = await computeDre({ month: now.getMonth() + 1, year: now.getFullYear(), empresaIds: [empresa.id] });
            const faturamento = r.find((x) => x.key === "faturamentos")?.value ?? 0;
            const lucroLiquido = r.find((x) => x.key === "lucro-liquido")?.value ?? 0;
            const margem = r.find((x) => x.key === "margem-contribuicao")?.value ?? 0;
            const cmv = r.find((x) => x.key === "cmv")?.value ?? 0;
            return {
              empresa: { id: empresa.id, name: empresa.name, color: empresa.color },
              faturamento,
              lucroLiquido,
              margem,
              cmv,
              margemPct: faturamento ? (lucroLiquido / faturamento) * 100 : 0,
            };
          })
        )
      : null;

  return (
    <PageContainer title="Financeiro" subtitle="DRE — Demonstração do Resultado do Exercício">
      <div className="space-y-6">
        <FinanceTabs />
        <DreClient
          initialRows={rows}
          initialMonth={now.getMonth() + 1}
          initialYear={now.getFullYear()}
          monthlyEvolution={monthlyEvolution}
          comparison={comparison}
        />
      </div>
    </PageContainer>
  );
}
