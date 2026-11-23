import { and, eq, inArray, sql } from 'drizzle-orm';
import type { Db } from '../../core/db/client';
import { loginAttempts, roles, users } from '../../core/db/schema';
import { LOGIN_RULES } from './auth.dto';

const { windowMin, lockMin } = LOGIN_RULES;

export const createAuthRepository = (db: Db) => ({
  byEmail: async (email: string) => (await db.select().from(users).where(eq(users.email, email)))[0],
  byId: async (id: number) => (await db.select().from(users).where(eq(users.id, id)))[0],
  /** Current identity and permissions, read fresh on every request (never trusted from the token). */
  session: async (id: number) => (await db.select({
    id: users.id, name: users.name, email: users.email, role: users.role, tokenVersion: users.tokenVersion,
    canWrite: roles.canWrite, isAdmin: roles.isAdmin,
  }).from(users).innerJoin(roles, eq(roles.code, users.role)).where(eq(users.id, id)))[0],
  /** Changing the password also bumps the token version, which revokes every session issued before. */
  setPassword: (id: number, passwordHash: string) => db.update(users).set({ passwordHash, tokenVersion: sql`${users.tokenVersion} + 1` }).where(eq(users.id, id)),

  /** Seconds the longest active lock among `keys` still has to run (0 = none). */
  async lockedFor(keys: string[]) {
    const [r] = await db.select({ secs: sql<number>`coalesce(max(extract(epoch from (${loginAttempts.lockedUntil} - now()))), 0)::int`.mapWith(Number) })
      .from(loginAttempts).where(and(inArray(loginAttempts.key, keys), sql`${loginAttempts.lockedUntil} > now()`));
    return r?.secs ?? 0;
  },
  /** Count a failure; once `limit` failures fall inside the window the key is locked. Single atomic statement. */
  recordFailure: (key: string, limit: number) => db.execute(sql`
    insert into login_attempts (key, failures, window_start) values (${key}, 1, now())
    on conflict (key) do update set
      failures = case when login_attempts.window_start < now() - make_interval(mins => ${windowMin}) then 1 else login_attempts.failures + 1 end,
      window_start = case when login_attempts.window_start < now() - make_interval(mins => ${windowMin}) then now() else login_attempts.window_start end,
      locked_until = case when (case when login_attempts.window_start < now() - make_interval(mins => ${windowMin}) then 1 else login_attempts.failures + 1 end) >= ${limit}
                          then now() + make_interval(mins => ${lockMin}) else login_attempts.locked_until end`),
  clearAttempts: (keys: string[]) => db.delete(loginAttempts).where(inArray(loginAttempts.key, keys)),
  purgeOldAttempts: () => db.delete(loginAttempts).where(sql`${loginAttempts.windowStart} < now() - interval '1 day'`),
});
