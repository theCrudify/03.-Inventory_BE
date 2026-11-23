import { and, asc, eq, getTableColumns, ilike, inArray, or, sql, type SQL } from 'drizzle-orm';
import type { Db } from '../../core/db/client';
import { items, stockMovements } from '../../core/db/schema';
import { likePattern, toLimit } from '../../core/http';
import type { ItemListQuery } from './items.dto';

// Explicit aliases: drizzle renders bare column names inside raw subqueries.
const stock = sql<number>`coalesce((select sum(m.qty) from ${stockMovements} m where m.item_id = "items"."id"), 0)`.mapWith(Number);

export const createItemsRepository = (db: Db) => ({
  list: (p: ItemListQuery) => {
    const q = likePattern(p.q);
    const where: SQL[] = [];
    if (q) where.push(or(ilike(items.code, q), ilike(items.name, q), ilike(items.hsCode, q))!);
    if (p.category) where.push(eq(items.category, p.category));
    return db.select({ ...getTableColumns(items), stock, total: sql<number>`count(*) over()`.mapWith(Number) }).from(items)
      .where(and(...where)).orderBy(asc(items.code)).limit(toLimit(p).limit).offset(toLimit(p).offset);
  },
  byIds: (ids: number[]) => db.select().from(items).where(inArray(items.id, ids)),
  insert: async (row: typeof items.$inferInsert) => (await db.insert(items).values(row).returning())[0],
  update: async (id: number, row: Partial<typeof items.$inferInsert>) => (await db.update(items).set(row).where(eq(items.id, id)).returning())[0],
  remove: async (id: number) => (await db.delete(items).where(eq(items.id, id)).returning())[0],
});
