import { and, asc, eq, sql, type SQL } from 'drizzle-orm';
import type { Db } from '../../core/db/client';
import { users } from '../../core/db/schema';
import { orderByFor, searchSql, toLimit } from '../../core/http';
import type { UserListQuery } from './users.dto';

const publicCols = { id: users.id, name: users.name, email: users.email, role: users.role, createdAt: users.createdAt };

export const createUsersRepository = (db: Db) => ({
  list: (p: UserListQuery) => {
    const where: SQL[] = [];
    const search = searchSql(p.q, [users.name, users.email, users.role]);
    if (search) where.push(search);
    if (p.role) where.push(eq(users.role, p.role));
    const order = orderByFor({ name: users.name, email: users.email, role: users.role, createdAt: users.createdAt }, p.sortBy, p.sortDir, [asc(users.name)]);
    return db.select({ ...publicCols, total: sql<number>`count(*) over()`.mapWith(Number) }).from(users)
      .where(and(...where)).orderBy(...order).limit(toLimit(p).limit).offset(toLimit(p).offset);
  },
  insert: async (row: typeof users.$inferInsert) => (await db.insert(users).values(row).returning(publicCols))[0],
  update: async (id: number, row: Partial<typeof users.$inferInsert>) => (await db.update(users).set(row).where(eq(users.id, id)).returning(publicCols))[0],
  remove: async (id: number) => (await db.delete(users).where(eq(users.id, id)).returning(publicCols))[0],
});
