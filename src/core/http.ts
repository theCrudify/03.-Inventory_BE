import { and, asc, desc, ilike, or, type AnyColumn, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import type { Ctx } from './env';

z.config(z.locales.id());

/** Shared query DTO for list endpoints. */
export const pageQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(20),
  q: z.string().trim().optional(),
  sortBy: z.string().trim().optional(),
  sortDir: z.enum(['asc', 'desc']).default('asc'),
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

/** Multi-token case-insensitive search: every space-separated term must match at least one column. */
export function searchSql(q: string | undefined, cols: (AnyColumn | SQL)[]): SQL | undefined {
  const tokens = (q ?? '').trim().split(/\s+/).filter(Boolean);
  if (!tokens.length || !cols.length) return undefined;
  return and(...tokens.map((t) => {
    const pat = likePattern(t)!;
    return or(...cols.map((c) => ilike(c, pat)))!;
  }));
}

/** Whitelisted dynamic sorting with a deterministic fallback order. */
export function orderByFor(
  map: Record<string, AnyColumn | SQL>,
  sortBy: string | undefined,
  sortDir: 'asc' | 'desc',
  fallback: SQL[],
): SQL[] {
  const col = sortBy && Object.prototype.hasOwnProperty.call(map, sortBy) ? map[sortBy] : undefined;
  if (!col) return fallback;
  return [sortDir === 'desc' ? desc(col) : asc(col), ...fallback];
}

export const idParam = (c: Ctx, name = 'id') => z.coerce.number().int().positive().parse(c.req.param(name));
export const body = async <S extends z.ZodType>(c: Ctx, schema: S): Promise<z.infer<S>> => schema.parse(await c.req.json().catch(() => ({})));
export const query = <S extends z.ZodType>(c: Ctx, schema: S): z.infer<S> => schema.parse(c.req.query());
