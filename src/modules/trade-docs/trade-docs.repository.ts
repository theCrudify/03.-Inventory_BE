import { and, desc, eq, getTableColumns, ilike, sql, type SQL } from 'drizzle-orm';
import type { Db } from '../../core/db/client';
import { partners, tradeDocs } from '../../core/db/schema';
import { likePattern, toLimit } from '../../core/http';
import type { TradeDocListQuery } from './trade-docs.dto';

const withPartner = { ...getTableColumns(tradeDocs), partnerName: partners.name };

export const createTradeDocsRepository = (db: Db) => ({
  list: (p: TradeDocListQuery) => {
    const where: SQL[] = [];
    if (p.kind) where.push(eq(tradeDocs.kind, p.kind));
    const q = likePattern(p.q);
    if (q) where.push(ilike(tradeDocs.number, q));
    // `total` is the window count; the document amount is exposed as `amount`.
    return db.select({ ...withPartner, amount: tradeDocs.total, total: sql<number>`count(*) over()`.mapWith(Number) })
      .from(tradeDocs).innerJoin(partners, eq(partners.id, tradeDocs.partnerId))
      .where(and(...where)).orderBy(desc(tradeDocs.date), desc(tradeDocs.id)).limit(toLimit(p).limit).offset(toLimit(p).offset);
  },
  byId: async (id: number) => (await db.select(withPartner).from(tradeDocs).innerJoin(partners, eq(partners.id, tradeDocs.partnerId)).where(eq(tradeDocs.id, id)))[0],
  insert: async (row: typeof tradeDocs.$inferInsert) => (await db.insert(tradeDocs).values(row).returning())[0],
  update: async (id: number, row: Partial<typeof tradeDocs.$inferInsert>) => (await db.update(tradeDocs).set(row).where(eq(tradeDocs.id, id)).returning())[0],
  remove: async (id: number) => (await db.delete(tradeDocs).where(eq(tradeDocs.id, id)).returning())[0],
});
