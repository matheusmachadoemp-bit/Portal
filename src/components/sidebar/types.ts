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
  /** Se falso, a categoria não navega pra /portal/{key} ao ser clicada — vira só um agrupador visual das subcategorias. */
  linked: boolean;
  subcategories: SubcategoryDTO[];
};
