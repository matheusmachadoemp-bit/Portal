import { PageContainer } from "@/components/page-container";
import { RelatoriosClient } from "./relatorios-client";

export default function RelatoriosPage() {
  return (
    <PageContainer title="Financeiro" subtitle="Relatórios">
      <div className="space-y-6">
        <RelatoriosClient />
      </div>
    </PageContainer>
  );
}
