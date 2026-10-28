import type { CategoriesResponse } from "../types/category";

const API_URL = import.meta.env.VITE_API_URL;

export const getCategories = async (): Promise<CategoriesResponse> => {
  const response = await fetch(`${API_URL}/categories`);

  if (!response.ok) {
    throw new Error("Failed to fetch categories");
  }

  return response.json();
};