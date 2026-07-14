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
  subcategories: SubcategoryDTO[];
};
