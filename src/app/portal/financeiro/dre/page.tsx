import { PageContainer } from "@/components/page-container";
import { FinanceTabs } from "../finance-tabs";
import { computeDre } from "@/lib/dre";
import { DreClient } from "./dre-client";

export default async function DrePage() {
  const now = new Date();
  const rows = await computeDre({ month: now.getMonth() + 1, year: now.getFullYear(), empresa: "ALL" });

  const monthlyEvolution = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const r = await computeDre({ month: d.getMonth() + 1, year: d.getFullYear(), empresa: "ALL" });
    monthlyEvolution.push({
      month: d.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" }),
      faturamento: r.find((x) => x.key === "faturamentos")?.value ?? 0,
      lucroLiquido: r.find((x) => x.key === "lucro-liquido")?.value ?? 0,
    });
  }

  return (
    <PageContainer title="Financeiro" subtitle="DRE — Demonstração do Resultado do Exercício">
      <div className="space-y-6">
        <FinanceTabs />
        <DreClient
          initialRows={rows}
          initialMonth={now.getMonth() + 1}
          initialYear={now.getFullYear()}
          monthlyEvolution={monthlyEvolution}
        />
      </div>
    </PageContainer>
  );
}
