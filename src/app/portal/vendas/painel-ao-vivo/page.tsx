import { PageContainer } from "@/components/page-container";
import { VendasTabs } from "../vendas-tabs";
import { PainelAoVivoClient } from "./painel-ao-vivo-client";

export default function PainelAoVivoPage() {
  return (
    <PageContainer title="Vendas" subtitle="Painel ao Vivo">
      <div className="space-y-6">
        <VendasTabs />
        <PainelAoVivoClient />
      </div>
    </PageContainer>
  );
}
