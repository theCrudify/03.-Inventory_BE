import { eq } from 'drizzle-orm';
import type { Db } from '../../core/db/client';
import { users } from '../../core/db/schema';

export const createAuthRepository = (db: Db) => ({
  byEmail: async (email: string) => (await db.select().from(users).where(eq(users.email, email)))[0],
  byId: async (id: number) => (await db.select().from(users).where(eq(users.id, id)))[0],
  setPassword: (id: number, passwordHash: string) => db.update(users).set({ passwordHash }).where(eq(users.id, id)),
});
