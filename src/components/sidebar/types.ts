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
