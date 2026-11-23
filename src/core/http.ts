import { z } from 'zod';
import type { Ctx } from './env';

z.config(z.locales.id());

/** Shared query DTO for list endpoints. */
export const pageQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().trim().optional(),
});
export type PageQuery = z.infer<typeof pageQuery>;
export const toLimit = (p: PageQuery) => ({ limit: p.pageSize, offset: (p.page - 1) * p.pageSize });

export type Paged<T> = { data: T[]; total: number; page: number; pageSize: number };
/** Rows carry a window-function `total`; move it into the envelope. */
export const envelope = <T extends { total: number }>(rows: T[], p: PageQuery): Paged<Omit<T, 'total'>> => ({
  data: rows.map(({ total: _t, ...r }) => r),
  total: rows[0]?.total ?? 0,
  page: p.page,
  pageSize: p.pageSize,
});
export const likePattern = (q?: string) => (q ? `%${q.replace(/[%_\\]/g, '\\$&')}%` : undefined);

export const idParam = (c: Ctx, name = 'id') => z.coerce.number().int().positive().parse(c.req.param(name));
export const body = async <S extends z.ZodType>(c: Ctx, schema: S): Promise<z.infer<S>> => schema.parse(await c.req.json().catch(() => ({})));
export const query = <S extends z.ZodType>(c: Ctx, schema: S): z.infer<S> => schema.parse(c.req.query());
