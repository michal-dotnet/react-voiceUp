export type Category = {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
};

export type CategoriesResponse = {
  data: Category[];
};