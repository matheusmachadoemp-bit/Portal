import { PageContainer } from "@/components/page-container";
import { FinanceTabs } from "../finance-tabs";
import { RelatoriosClient } from "./relatorios-client";

export default function RelatoriosPage() {
  return (
    <PageContainer title="Financeiro" subtitle="Relatórios">
      <div className="space-y-6">
        <FinanceTabs />
        <RelatoriosClient />
      </div>
    </PageContainer>
  );
}
