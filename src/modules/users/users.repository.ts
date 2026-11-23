import { asc, eq } from 'drizzle-orm';
import type { Db } from '../../core/db/client';
import { users } from '../../core/db/schema';

const publicCols = { id: users.id, name: users.name, email: users.email, role: users.role, createdAt: users.createdAt };

export const createUsersRepository = (db: Db) => ({
  list: () => db.select(publicCols).from(users).orderBy(asc(users.name)),
  insert: async (row: typeof users.$inferInsert) => (await db.insert(users).values(row).returning(publicCols))[0],
  update: async (id: number, row: Partial<typeof users.$inferInsert>) => (await db.update(users).set(row).where(eq(users.id, id)).returning(publicCols))[0],
  remove: async (id: number) => (await db.delete(users).where(eq(users.id, id)).returning(publicCols))[0],
});
