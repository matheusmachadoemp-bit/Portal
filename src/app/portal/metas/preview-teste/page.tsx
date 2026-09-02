import { PageContainer } from "@/components/page-container";
import { MetasPreviewClient } from "./metas-preview-client";

export default async function MetasPreviewPage() {
  return (
    <PageContainer title="Metas" subtitle="Acompanhe metas, evolução e desempenho das unidades. (Tela de teste — dados fictícios)">
      <MetasPreviewClient />
    </PageContainer>
  );
}
