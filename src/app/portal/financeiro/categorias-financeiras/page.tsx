import { PageContainer } from "@/components/page-container";
import { allDreCategories } from "@/lib/dre-structure";
import { CategoriasClient } from "./categorias-client";
import { getFinancialCategories } from "@/lib/financial-categories";

export default async function CategoriasFinanceirasPage() {
  const categories = await getFinancialCategories();

  return (
    <PageContainer title="Financeiro" subtitle="Categorias Financeiras">
      <div className="space-y-6">
        <CategoriasClient initialCategories={categories} dreOptions={allDreCategories()} />
      </div>
    </PageContainer>
  );
}
