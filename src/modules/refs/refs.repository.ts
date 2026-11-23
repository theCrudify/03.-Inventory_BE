import { and, asc, eq, ilike, inArray, or, sql } from 'drizzle-orm';
import type { Db } from '../../core/db/client';
import { refs } from '../../core/db/schema';
import { likePattern, toLimit, type PageQuery } from '../../core/http';

export const createRefsRepository = (db: Db) => ({
  list: (type: string, p: PageQuery) => {
    const q = likePattern(p.q);
    return db.select({ id: refs.id, type: refs.type, code: refs.code, name: refs.name, meta: refs.meta, sort: refs.sort, total: sql<number>`count(*) over()`.mapWith(Number) })
      .from(refs).where(and(eq(refs.type, type), q ? or(ilike(refs.code, q), ilike(refs.name, q)) : undefined))
      .orderBy(asc(refs.sort), asc(refs.code)).limit(toLimit(p).limit).offset(toLimit(p).offset);
  },
  byType: (type: string) => db.select().from(refs).where(eq(refs.type, type)).orderBy(asc(refs.sort), asc(refs.code)),
  byTypes: (types: string[]) => db.select().from(refs).where(inArray(refs.type, types)).orderBy(asc(refs.type), asc(refs.sort), asc(refs.code)),
  find: async (type: string, code: string) => (await db.select().from(refs).where(and(eq(refs.type, type), eq(refs.code, code))))[0],
  /** HS codes are stored dotted (5208.52.00); lookups accept any punctuation. */
  findHs: async (digits: string) => (await db.select().from(refs).where(and(eq(refs.type, 'hs'), sql`replace(${refs.code}, '.', '') = ${digits}`)))[0],
  insert: async (row: typeof refs.$inferInsert) => (await db.insert(refs).values(row).returning())[0],
  update: async (type: string, id: number, row: Partial<typeof refs.$inferInsert>) =>
    (await db.update(refs).set(row).where(and(eq(refs.id, id), eq(refs.type, type))).returning())[0],
  remove: async (type: string, id: number) => (await db.delete(refs).where(and(eq(refs.id, id), eq(refs.type, type))).returning())[0],
});
export type RefsRepository = ReturnType<typeof createRefsRepository>;
