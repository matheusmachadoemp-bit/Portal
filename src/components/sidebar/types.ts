export type SubcategoryDTO = {
  id: string;
  categoryId: string;
  key: string;
  name: string;
  icon: string;
  color: string;
  order: number;
  active: boolean;
  isSystem: boolean;
  /** Loja dona desta subcategoria (id de Empresa) — `null` = compartilhada, aparece não importa
   * a loja ativa. Ver comentário de Subcategory.empresaId em prisma/schema.prisma. */
  empresaId: string | null;
};

export type CategoryDTO = {
  id: string;
  key: string;
  name: string;
  icon: string;
  color: string;
  order: number;
  active: boolean;
  isSystem: boolean;
  contentType: string;
  /** Vestigial desde 2026-10: `sidebar.tsx` não usa mais este campo pra decidir navegação —
   * clicar numa categoria com subcategoria só expande/recolhe, incondicional; sem nenhuma
   * subcategoria, sempre navega. Ver comentário de `Category.linked` em prisma/schema.prisma. */
  linked: boolean;
  subcategories: SubcategoryDTO[];
};
