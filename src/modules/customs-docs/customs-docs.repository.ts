import { and, asc, desc, eq, getTableColumns, gte, ilike, inArray, lte, or, sql, type SQL } from 'drizzle-orm';
import type { Db } from '../../core/db/client';
import { customsDocEvents, customsDocLines, customsDocs, items, partners, stockMovements } from '../../core/db/schema';
import { likePattern, toLimit } from '../../core/http';
import type { CustomsDocListQuery } from './customs-docs.dto';

type Doc = typeof customsDocs.$inferSelect;
type DocInsert = typeof customsDocs.$inferInsert;
type LineInsert = Omit<typeof customsDocLines.$inferInsert, 'docId'>;
type EventInsert = typeof customsDocEvents.$inferInsert;
type MoveInsert = typeof stockMovements.$inferInsert;

export const createCustomsDocsRepository = (db: Db) => ({
  list(p: CustomsDocListQuery) {
    const where: SQL[] = [];
    if (p.bc) where.push(eq(customsDocs.bcType, p.bc));
    if (p.status) where.push(eq(customsDocs.status, p.status));
    const q = likePattern(p.q);
    if (q) where.push(or(ilike(customsDocs.ajuNumber, q), ilike(customsDocs.registrationNumber, q), ilike(partners.name, q))!);
    if (p.from) where.push(gte(customsDocs.createdAt, new Date(p.from)));
    if (p.to) where.push(lte(customsDocs.createdAt, new Date(`${p.to}T23:59:59`)));
    const { header: _h, duties: _d, ...cols } = getTableColumns(customsDocs);
    return db.select({ ...cols, partnerName: partners.name, total: sql<number>`count(*) over()`.mapWith(Number) })
      .from(customsDocs).innerJoin(partners, eq(partners.id, customsDocs.partnerId))
      .where(and(...where)).orderBy(desc(customsDocs.createdAt)).limit(toLimit(p).limit).offset(toLimit(p).offset);
  },
  byId: async (id: number) => (await db.select().from(customsDocs).where(eq(customsDocs.id, id)))[0],
  byAju: async (aju: string) => (await db.select().from(customsDocs).where(eq(customsDocs.ajuNumber, aju)))[0],
  byStatuses: (statuses: string[]) => (statuses.length ? db.select().from(customsDocs).where(inArray(customsDocs.status, statuses)) : Promise.resolve([])),
  lines: (docId: number) => db.select().from(customsDocLines).where(eq(customsDocLines.docId, docId)).orderBy(asc(customsDocLines.id)),
  linesWithItems: (docId: number) => db.select({ ...getTableColumns(customsDocLines), itemCode: items.code, itemName: items.name, uom: items.uom })
    .from(customsDocLines).innerJoin(items, eq(items.id, customsDocLines.itemId))
    .where(eq(customsDocLines.docId, docId)).orderBy(asc(customsDocLines.id)),
  events: (docId: number) => db.select().from(customsDocEvents).where(eq(customsDocEvents.docId, docId)).orderBy(asc(customsDocEvents.createdAt)),
  countOnDate: async (ymd: string, timeZone: string) => (await db.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(customsDocs)
    .where(sql`(${customsDocs.createdAt} at time zone ${timeZone})::date = ${ymd}::date`))[0].n,

  insert: (doc: DocInsert, lines: LineInsert[]) => db.transaction(async (tx) => {
    const [d] = await tx.insert(customsDocs).values(doc).returning();
    await tx.insert(customsDocLines).values(lines.map((l) => ({ ...l, docId: d.id })));
    return d;
  }),
  /** Editing resets the document to the initial status and clears any previous CEISA responses. */
  replace: (id: number, doc: Partial<DocInsert>, initialStatus: string, lines: LineInsert[]) => db.transaction(async (tx) => {
    const [d] = await tx.update(customsDocs).set({ ...doc, status: initialStatus, submittedAt: null, registrationNumber: null, registrationDate: null })
      .where(eq(customsDocs.id, id)).returning();
    await tx.delete(customsDocLines).where(eq(customsDocLines.docId, id));
    await tx.delete(customsDocEvents).where(eq(customsDocEvents.docId, id));
    await tx.insert(customsDocLines).values(lines.map((l) => ({ ...l, docId: id })));
    return d;
  }),
  remove: (id: number) => db.delete(customsDocs).where(eq(customsDocs.id, id)),

  /** First line whose quantity exceeds the item's current stock. */
  async shortage(docId: number) {
    const rows = await db.execute<{ code: string; need: string; stock: string }>(sql`
      select i.code, sum(l.qty) as need, coalesce((select sum(m.qty) from ${stockMovements} m where m.item_id = i.id), 0) as stock
      from ${customsDocLines} l join ${items} i on i.id = l.item_id
      where l.doc_id = ${docId} group by i.id, i.code
      having sum(l.qty) > coalesce((select sum(m.qty) from ${stockMovements} m where m.item_id = i.id), 0)
      limit 1`);
    return rows[0];
  },

  markSubmitted: (id: number, at: Date, firstEvent: Omit<EventInsert, 'docId'>) => db.transaction(async (tx) => {
    await tx.delete(customsDocEvents).where(eq(customsDocEvents.docId, id));
    const [d] = await tx.update(customsDocs).set({ status: firstEvent.status, submittedAt: at, registrationNumber: null, registrationDate: null })
      .where(eq(customsDocs.id, id)).returning();
    await tx.insert(customsDocEvents).values({ ...firstEvent, docId: id });
    return d;
  }),

  /**
   * Move a document to `next` status with its CEISA events (and stock if approved), atomically.
   * Only the request that wins the conditional status update writes, so concurrent reads can't double-book stock.
   */
  advance: (doc: Doc, next: Partial<Doc> & { status: Doc['status'] }, events: EventInsert[], moves: MoveInsert[]) => db.transaction(async (tx) => {
    const [won] = await tx.update(customsDocs).set(next)
      .where(and(eq(customsDocs.id, doc.id), eq(customsDocs.status, doc.status))).returning({ id: customsDocs.id });
    if (!won) return false;
    if (events.length) await tx.insert(customsDocEvents).values(events).onConflictDoNothing();
    if (moves.length) await tx.insert(stockMovements).values(moves);
    return true;
  }),
});
export type CustomsDocsRepository = ReturnType<typeof createCustomsDocsRepository>;
