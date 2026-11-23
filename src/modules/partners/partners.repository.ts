import { and, asc, eq, getTableColumns, ilike, or, sql, type SQL } from 'drizzle-orm';
import type { Db } from '../../core/db/client';
import { partners } from '../../core/db/schema';
import { likePattern, toLimit } from '../../core/http';
import type { PartnerListQuery } from './partners.dto';

export const createPartnersRepository = (db: Db) => ({
  list: (p: PartnerListQuery) => {
    const q = likePattern(p.q);
    const where: SQL[] = [];
    if (q) where.push(or(ilike(partners.name, q), ilike(partners.npwp, q))!);
    if (p.kind) where.push(eq(partners.kind, p.kind));
    return db.select({ ...getTableColumns(partners), total: sql<number>`count(*) over()`.mapWith(Number) }).from(partners)
      .where(and(...where)).orderBy(asc(partners.name)).limit(toLimit(p).limit).offset(toLimit(p).offset);
  },
  byId: async (id: number) => (await db.select().from(partners).where(eq(partners.id, id)))[0],
  insert: async (row: typeof partners.$inferInsert) => (await db.insert(partners).values(row).returning())[0],
  update: async (id: number, row: Partial<typeof partners.$inferInsert>) => (await db.update(partners).set(row).where(eq(partners.id, id)).returning())[0],
  remove: async (id: number) => (await db.delete(partners).where(eq(partners.id, id)).returning())[0],
});
