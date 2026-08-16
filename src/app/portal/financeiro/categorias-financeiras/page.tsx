import { prisma } from "@/lib/prisma";
import { PageContainer } from "@/components/page-container";
import { allDreCategories } from "@/lib/dre-structure";
import { CategoriasClient } from "./categorias-client";

export default async function CategoriasFinanceirasPage() {
  const categories = await prisma.financialCategory.findMany({ orderBy: { name: "asc" } });

  return (
    <PageContainer title="Financeiro" subtitle="Categorias Financeiras">
      <div className="space-y-6">
        <CategoriasClient initialCategories={categories} dreOptions={allDreCategories()} />
      </div>
    </PageContainer>
  );
}
