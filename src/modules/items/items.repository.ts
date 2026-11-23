import { and, asc, eq, getTableColumns, inArray, sql, type SQL } from 'drizzle-orm';
import type { Db } from '../../core/db/client';
import { items, stockMovements } from '../../core/db/schema';
import { orderByFor, searchSql, toLimit } from '../../core/http';
import type { ItemListQuery } from './items.dto';

// Explicit aliases: drizzle renders bare column names inside raw subqueries.
const stock = sql<number>`coalesce((select sum(m.qty) from ${stockMovements} m where m.item_id = "items"."id"), 0)`.mapWith(Number);

export const createItemsRepository = (db: Db) => ({
  list: (p: ItemListQuery) => {
    const where: SQL[] = [];
    const search = searchSql(p.q, [items.code, items.name, items.category, items.hsCode, items.uom]);
    if (search) where.push(search);
    if (p.category) where.push(eq(items.category, p.category));
    const order = orderByFor(
      { code: items.code, name: items.name, category: items.category, hsCode: items.hsCode, uom: items.uom, stock, createdAt: items.createdAt },
      p.sortBy, p.sortDir, [asc(items.code)],
    );
    return db.select({ ...getTableColumns(items), stock, total: sql<number>`count(*) over()`.mapWith(Number) }).from(items)
      .where(and(...where)).orderBy(...order).limit(toLimit(p).limit).offset(toLimit(p).offset);
  },
  byIds: (ids: number[]) => db.select().from(items).where(inArray(items.id, ids)),
  insert: async (row: typeof items.$inferInsert) => (await db.insert(items).values(row).returning())[0],
  update: async (id: number, row: Partial<typeof items.$inferInsert>) => (await db.update(items).set(row).where(eq(items.id, id)).returning())[0],
  remove: async (id: number) => (await db.delete(items).where(eq(items.id, id)).returning())[0],
});
