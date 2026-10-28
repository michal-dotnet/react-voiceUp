import { z } from 'zod';

export const paginationQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});

export type Pagination = z.output<typeof paginationQuery>;

export interface PageMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export function toSkipTake({ page, pageSize }: Pagination): { skip: number; take: number } {
  return { skip: (page - 1) * pageSize, take: pageSize };
}

export function pageMeta({ page, pageSize }: Pagination, total: number): PageMeta {
  return { page, pageSize, total, totalPages: Math.ceil(total / pageSize) };
}
