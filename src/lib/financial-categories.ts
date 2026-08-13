import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";

// FinancialCategory não tem empresaId — é uma tabela de referência global
// (mesmas categorias para todas as lojas), gerenciada raramente via admin.
// Por isso é seguro cachear sem escopo de usuário/empresa.
const CACHE_TAG = "financial-categories";

export const getFinancialCategories = unstable_cache(
  async () => prisma.financialCategory.findMany({ orderBy: { name: "asc" } }),
  ["financial-categories-all"],
  { tags: [CACHE_TAG] }
);

export const getActiveFinancialCategories = unstable_cache(
  async () => prisma.financialCategory.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
  ["financial-categories-active"],
  { tags: [CACHE_TAG] }
);
