import { asc, eq } from 'drizzle-orm';
import type { Db } from '../../core/db/client';
import { roles } from '../../core/db/schema';

export const createRolesRepository = (db: Db) => ({
  list: () => db.select().from(roles).orderBy(asc(roles.sort), asc(roles.code)),
  find: async (code: string) => (await db.select().from(roles).where(eq(roles.code, code)))[0],
  insert: async (row: typeof roles.$inferInsert) => (await db.insert(roles).values(row).returning())[0],
  update: async (code: string, row: Partial<typeof roles.$inferInsert>) => (await db.update(roles).set(row).where(eq(roles.code, code)).returning())[0],
  remove: async (code: string) => (await db.delete(roles).where(eq(roles.code, code)).returning())[0],
});
