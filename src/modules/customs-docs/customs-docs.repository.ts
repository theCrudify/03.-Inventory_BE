import { and, asc, desc, eq, getTableColumns, gte, inArray, lte, sql, type SQL } from 'drizzle-orm';
import type { Db } from '../../core/db/client';
import {
  customsDocContainers, customsDocDocuments, customsDocEvents, customsDocGuarantees, customsDocLines, customsDocs, dutyTreatments, items, partners, stockMovements,
} from '../../core/db/schema';
import { orderByFor, searchSql, toLimit } from '../../core/http';
import type { CustomsDocListQuery } from './customs-docs.dto';
import type { ContainerInsert, DocumentInsert, GuaranteeInsert } from './customs-docs.mapper';

type Doc = typeof customsDocs.$inferSelect;
type DocInsert = typeof customsDocs.$inferInsert;
type LineInsert = Omit<typeof customsDocLines.$inferInsert, 'docId'>;
type EventInsert = typeof customsDocEvents.$inferInsert;
type MoveInsert = typeof stockMovements.$inferInsert;
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
/** Everything that lives in child tables of a BC document. */
export type DocChildren = { lines: LineInsert[]; containers: ContainerInsert[]; documents: DocumentInsert[]; guarantee: GuaranteeInsert | null };

const formattedAju = sql`substr(${customsDocs.ajuNumber}, 1, 6) || '-' || substr(${customsDocs.ajuNumber}, 7, 6) || '-' || substr(${customsDocs.ajuNumber}, 13, 8) || '-' || substr(${customsDocs.ajuNumber}, 21, 6)`;

/** Columns shown in lists (no transport/duty detail). */
const listColumns = {
  id: customsDocs.id, bcType: customsDocs.bcType, ajuNumber: customsDocs.ajuNumber, registrationNumber: customsDocs.registrationNumber,
  registrationDate: customsDocs.registrationDate, status: customsDocs.status, partnerId: customsDocs.partnerId, tradeDocId: customsDocs.tradeDocId,
  officeCode: customsDocs.officeCode, currency: customsDocs.currency, kurs: customsDocs.kurs, totalValue: customsDocs.totalValue,
  submittedAt: customsDocs.submittedAt, createdBy: customsDocs.createdBy, createdAt: customsDocs.createdAt, updatedAt: customsDocs.updatedAt,
};

const insertChildren = async (tx: Tx, docId: number, c: DocChildren) => {
  await tx.insert(customsDocLines).values(c.lines.map((l) => ({ ...l, docId })));
  if (c.containers.length) await tx.insert(customsDocContainers).values(c.containers.map((k) => ({ ...k, docId })));
  if (c.documents.length) await tx.insert(customsDocDocuments).values(c.documents.map((d) => ({ ...d, docId })));
  if (c.guarantee) await tx.insert(customsDocGuarantees).values({ ...c.guarantee, docId });
};
const deleteChildren = async (tx: Tx, docId: number) => {
  await tx.delete(customsDocLines).where(eq(customsDocLines.docId, docId));
  await tx.delete(customsDocContainers).where(eq(customsDocContainers.docId, docId));
  await tx.delete(customsDocDocuments).where(eq(customsDocDocuments.docId, docId));
  await tx.delete(customsDocGuarantees).where(eq(customsDocGuarantees.docId, docId));
};

export const createCustomsDocsRepository = (db: Db) => ({
  list(p: CustomsDocListQuery) {
    const where: SQL[] = [];
    if (p.bc) where.push(eq(customsDocs.bcType, p.bc));
    if (p.status) where.push(eq(customsDocs.status, p.status));
    const search = searchSql(p.q, [
      customsDocs.ajuNumber, formattedAju, customsDocs.registrationNumber, partners.name,
      customsDocs.officeCode, customsDocs.currency, customsDocs.status,
    ]);
    if (search) where.push(search);
    if (p.from) where.push(gte(customsDocs.createdAt, new Date(p.from)));
    if (p.to) where.push(lte(customsDocs.createdAt, new Date(`${p.to}T23:59:59`)));
    const order = orderByFor(
      {
        ajuNumber: customsDocs.ajuNumber,
        registrationNumber: customsDocs.registrationNumber,
        partnerName: partners.name,
        totalValue: customsDocs.totalValue,
        status: customsDocs.status,
        createdAt: customsDocs.createdAt,
      },
      p.sortBy, p.sortDir, [desc(customsDocs.createdAt), desc(customsDocs.id)],
    );
    return db.select({ ...listColumns, partnerName: partners.name, total: sql<number>`count(*) over()`.mapWith(Number) })
      .from(customsDocs).innerJoin(partners, eq(partners.id, customsDocs.partnerId))
      .where(and(...where)).orderBy(...order).limit(toLimit(p).limit).offset(toLimit(p).offset);
  },
  byId: async (id: number) => (await db.select().from(customsDocs).where(eq(customsDocs.id, id)))[0],
  byAju: async (aju: string) => (await db.select().from(customsDocs).where(eq(customsDocs.ajuNumber, aju)))[0],
  byStatuses: (statuses: string[]) => (statuses.length ? db.select().from(customsDocs).where(inArray(customsDocs.status, statuses)) : Promise.resolve([] as Doc[])),
  lines: (docId: number) => db.select().from(customsDocLines).where(eq(customsDocLines.docId, docId)).orderBy(asc(customsDocLines.id)),
  linesWithItems: (docId: number) => db.select({ ...getTableColumns(customsDocLines), itemCode: items.code, itemName: items.name, uom: items.uom })
    .from(customsDocLines).innerJoin(items, eq(items.id, customsDocLines.itemId))
    .where(eq(customsDocLines.docId, docId)).orderBy(asc(customsDocLines.id)),
  containers: (docId: number) => db.select().from(customsDocContainers).where(eq(customsDocContainers.docId, docId)).orderBy(asc(customsDocContainers.id)),
  documents: (docId: number) => db.select().from(customsDocDocuments).where(eq(customsDocDocuments.docId, docId)).orderBy(asc(customsDocDocuments.id)),
  guarantee: async (docId: number) => (await db.select().from(customsDocGuarantees).where(eq(customsDocGuarantees.docId, docId)))[0],
  events: (docId: number) => db.select().from(customsDocEvents).where(eq(customsDocEvents.docId, docId)).orderBy(asc(customsDocEvents.createdAt)),
  dutyTreatmentName: async (code: string) => (await db.select({ name: dutyTreatments.name }).from(dutyTreatments).where(eq(dutyTreatments.code, code)))[0]?.name ?? code,
  countOnDate: async (ymd: string, timeZone: string) => (await db.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(customsDocs)
    .where(sql`(${customsDocs.createdAt} at time zone ${timeZone})::date = ${ymd}::date`))[0].n,

  insert: (doc: DocInsert, children: DocChildren) => db.transaction(async (tx) => {
    const [d] = await tx.insert(customsDocs).values(doc).returning();
    await insertChildren(tx, d.id, children);
    return d;
  }),
  /** Editing resets the document to the initial status and clears any previous CEISA responses. */
  replace: (id: number, doc: Partial<DocInsert>, initialStatus: string, children: DocChildren) => db.transaction(async (tx) => {
    const [d] = await tx.update(customsDocs).set({ ...doc, status: initialStatus, submittedAt: null, registrationNumber: null, registrationDate: null })
      .where(eq(customsDocs.id, id)).returning();
    await deleteChildren(tx, id);
    await tx.delete(customsDocEvents).where(eq(customsDocEvents.docId, id));
    await insertChildren(tx, id, children);
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
