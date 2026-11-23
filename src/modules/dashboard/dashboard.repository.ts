import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import type { Db } from '../../core/db/client';
import { customsDocEvents, customsDocs, items, partners } from '../../core/db/schema';

export const createDashboardRepository = (db: Db) => ({
  countsByTypeStatus: () => db.select({ bcType: customsDocs.bcType, status: customsDocs.status, n: sql<number>`count(*)`.mapWith(Number) })
    .from(customsDocs).groupBy(customsDocs.bcType, customsDocs.status),

  /** Nilai pabean (IDR) of approved documents per business month. */
  approvedValueByMonth: (approved: string[], months: number, timeZone: string) => db.select({
    month: sql<string>`to_char(date_trunc('month', ${customsDocs.submittedAt} at time zone ${timeZone}), 'YYYY-MM')`,
    bcType: customsDocs.bcType,
    idr: sql<number>`sum(${customsDocs.totalValue} * ${customsDocs.kurs})`.mapWith(Number),
  }).from(customsDocs)
    .where(and(inArray(customsDocs.status, approved.length ? approved : ['']), sql`${customsDocs.submittedAt} >= date_trunc('month', now()) - make_interval(months => ${months - 1})`))
    .groupBy(sql`1`, customsDocs.bcType),

  recentEvents: (limit: number) => db.select({
    id: customsDocEvents.id, docId: customsDocEvents.docId, status: customsDocEvents.status, code: customsDocEvents.code,
    message: customsDocEvents.message, createdAt: customsDocEvents.createdAt, ajuNumber: customsDocs.ajuNumber, bcType: customsDocs.bcType,
  }).from(customsDocEvents).innerJoin(customsDocs, eq(customsDocs.id, customsDocEvents.docId))
    .orderBy(desc(customsDocEvents.createdAt)).limit(limit),

  masterCounts: async () => (await db.select({
    items: sql<number>`(select count(*) from ${items})`.mapWith(Number),
    partners: sql<number>`(select count(*) from ${partners})`.mapWith(Number),
  }).from(sql`(select 1) x`))[0],
});
