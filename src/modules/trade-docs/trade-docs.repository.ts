import { and, asc, desc, eq, getTableColumns, inArray, sql, type SQL } from 'drizzle-orm';
import type { Db } from '../../core/db/client';
import { partners, tradeDocLines, tradeDocs } from '../../core/db/schema';
import { orderByFor, searchSql, toLimit } from '../../core/http';
import type { TradeDocListQuery } from './trade-docs.dto';

type LineInsert = Omit<typeof tradeDocLines.$inferInsert, 'tradeDocId'>;

const withPartner = { ...getTableColumns(tradeDocs), partnerName: partners.name };

export const createTradeDocsRepository = (db: Db) => ({
  list: (p: TradeDocListQuery) => {
    const where: SQL[] = [];
    if (p.kind) where.push(eq(tradeDocs.kind, p.kind));
    const search = searchSql(p.q, [tradeDocs.number, partners.name, tradeDocs.currency, tradeDocs.incoterm, sql`${tradeDocs.date}::text`]);
    if (search) where.push(search);
    const order = orderByFor(
      { number: tradeDocs.number, date: tradeDocs.date, partnerName: partners.name, incoterm: tradeDocs.incoterm, amount: tradeDocs.total, currency: tradeDocs.currency },
      p.sortBy, p.sortDir, [desc(tradeDocs.date), desc(tradeDocs.id)],
    );
    // `total` is the window count; the document amount is exposed as `amount`.
    return db.select({ ...withPartner, amount: tradeDocs.total, total: sql<number>`count(*) over()`.mapWith(Number) })
      .from(tradeDocs).innerJoin(partners, eq(partners.id, tradeDocs.partnerId))
      .where(and(...where)).orderBy(...order).limit(toLimit(p).limit).offset(toLimit(p).offset);
  },
  byId: async (id: number) => (await db.select(withPartner).from(tradeDocs).innerJoin(partners, eq(partners.id, tradeDocs.partnerId)).where(eq(tradeDocs.id, id)))[0],
  /** Lines of several documents at once (to avoid one query per row in lists). */
  lines: (ids: number[]) => (ids.length
    ? db.select().from(tradeDocLines).where(inArray(tradeDocLines.tradeDocId, ids)).orderBy(asc(tradeDocLines.id))
    : Promise.resolve([] as (typeof tradeDocLines.$inferSelect)[])),
  insert: (row: typeof tradeDocs.$inferInsert, lines: LineInsert[]) => db.transaction(async (tx) => {
    const [d] = await tx.insert(tradeDocs).values(row).returning();
    await tx.insert(tradeDocLines).values(lines.map((l) => ({ ...l, tradeDocId: d.id })));
    return d;
  }),
  update: (id: number, row: Partial<typeof tradeDocs.$inferInsert>, lines: LineInsert[]) => db.transaction(async (tx) => {
    const [d] = await tx.update(tradeDocs).set(row).where(eq(tradeDocs.id, id)).returning();
    if (!d) return undefined;
    await tx.delete(tradeDocLines).where(eq(tradeDocLines.tradeDocId, id));
    await tx.insert(tradeDocLines).values(lines.map((l) => ({ ...l, tradeDocId: id })));
    return d;
  }),
  remove: async (id: number) => (await db.delete(tradeDocs).where(eq(tradeDocs.id, id)).returning())[0],
});
