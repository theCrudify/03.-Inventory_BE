import { and, asc, eq, getTableColumns, sql, type SQL } from 'drizzle-orm';
import type { Db } from '../../core/db/client';
import { partners } from '../../core/db/schema';
import { orderByFor, searchSql, toLimit } from '../../core/http';
import type { PartnerListQuery } from './partners.dto';

export const createPartnersRepository = (db: Db) => ({
  list: (p: PartnerListQuery) => {
    const where: SQL[] = [];
    const search = searchSql(p.q, [partners.name, partners.kind, partners.npwp, partners.address, partners.countryCode]);
    if (search) where.push(search);
    if (p.kind) where.push(eq(partners.kind, p.kind));
    const order = orderByFor(
      { name: partners.name, kind: partners.kind, npwp: partners.npwp, countryCode: partners.countryCode, address: partners.address, createdAt: partners.createdAt },
      p.sortBy, p.sortDir, [asc(partners.name)],
    );
    return db.select({ ...getTableColumns(partners), total: sql<number>`count(*) over()`.mapWith(Number) }).from(partners)
      .where(and(...where)).orderBy(...order).limit(toLimit(p).limit).offset(toLimit(p).offset);
  },
  byId: async (id: number) => (await db.select().from(partners).where(eq(partners.id, id)))[0],
  insert: async (row: typeof partners.$inferInsert) => (await db.insert(partners).values(row).returning())[0],
  update: async (id: number, row: Partial<typeof partners.$inferInsert>) => (await db.update(partners).set(row).where(eq(partners.id, id)).returning())[0],
  remove: async (id: number) => (await db.delete(partners).where(eq(partners.id, id)).returning())[0],
});
