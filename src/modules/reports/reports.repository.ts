import { and, eq, inArray, sql, type SQL } from 'drizzle-orm';
import type { Db } from '../../core/db/client';
import { items, stockMovements as m } from '../../core/db/schema';
import { searchSql } from '../../core/http';
import type { MutasiQuery } from './reports.dto';

export const createReportsRepository = (db: Db) => ({
  /** Per item: opening balance before `from`, in/out/adjustment within the period. */
  mutasi: (q: MutasiQuery, adjustment: string[]) => {
    const adj = inArray(m.source, adjustment);
    const inRange = sql`${m.date} between ${q.from} and ${q.to}`;
    const where: SQL[] = [eq(items.category, q.category)];
    const search = searchSql(q.q, [items.code, items.name, items.hsCode, items.uom]);
    if (search) where.push(search);
    return db.select({
      itemId: items.id, code: items.code, name: items.name, uom: items.uom, hsCode: items.hsCode,
      saldoAwal: sql<number>`coalesce(sum(${m.qty}) filter (where ${m.date} < ${q.from}), 0)`.mapWith(Number),
      pemasukan: sql<number>`coalesce(sum(${m.qty}) filter (where ${inRange} and ${m.qty} > 0 and not ${adj}), 0)`.mapWith(Number),
      pengeluaran: sql<number>`coalesce(-sum(${m.qty}) filter (where ${inRange} and ${m.qty} < 0 and not ${adj}), 0)`.mapWith(Number),
      penyesuaian: sql<number>`coalesce(sum(${m.qty}) filter (where ${inRange} and ${adj}), 0)`.mapWith(Number),
    }).from(items).leftJoin(m, and(eq(m.itemId, items.id), sql`${m.date} <= ${q.to}`))
      .where(and(...where)).groupBy(items.id).orderBy(items.code);
  },
});
