import { asc, eq } from 'drizzle-orm';
import type { Db } from '../../core/db/client';
import { documentStatuses as t } from '../../core/db/schema';

export const createDocumentStatusesRepository = (db: Db) => ({
  list: () => db.select().from(t).orderBy(asc(t.sort), asc(t.code)),
  find: async (code: string) => (await db.select().from(t).where(eq(t.code, code)))[0],
  insert: async (row: typeof t.$inferInsert) => (await db.insert(t).values(row).returning())[0],
  update: async (code: string, row: Partial<typeof t.$inferInsert>) => (await db.update(t).set(row).where(eq(t.code, code)).returning())[0],
  remove: async (code: string) => (await db.delete(t).where(eq(t.code, code)).returning())[0],
});
