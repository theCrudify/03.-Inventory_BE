import { and, eq, inArray, sql } from 'drizzle-orm';
import type { Db } from '../../core/db/client';
import { items, stockMovements as m } from '../../core/db/schema';
import type { MutasiQuery } from './reports.dto';

export const createReportsRepository = (db: Db) => ({
  /** Per item: opening balance before `from`, in/out/adjustment within the period. */
  mutasi: (q: MutasiQuery, adjustment: string[]) => {
    const adj = inArray(m.source, adjustment);
    const inRange = sql`${m.date} between ${q.from} and ${q.to}`;
    return db.select({
      itemId: items.id, code: items.code, name: items.name, uom: items.uom, hsCode: items.hsCode,
      saldoAwal: sql<number>`coalesce(sum(${m.qty}) filter (where ${m.date} < ${q.from}), 0)`.mapWith(Number),
      pemasukan: sql<number>`coalesce(sum(${m.qty}) filter (where ${inRange} and ${m.qty} > 0 and not ${adj}), 0)`.mapWith(Number),
      pengeluaran: sql<number>`coalesce(-sum(${m.qty}) filter (where ${inRange} and ${m.qty} < 0 and not ${adj}), 0)`.mapWith(Number),
      penyesuaian: sql<number>`coalesce(sum(${m.qty}) filter (where ${inRange} and ${adj}), 0)`.mapWith(Number),
    }).from(items).leftJoin(m, and(eq(m.itemId, items.id), sql`${m.date} <= ${q.to}`))
      .where(eq(items.category, q.category)).groupBy(items.id).orderBy(items.code);
  },
});
