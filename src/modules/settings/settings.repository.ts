import { eq, inArray } from 'drizzle-orm';
import type { Db } from '../../core/db/client';
import { settings } from '../../core/db/schema';

export const createSettingsRepository = (db: Db) => ({
  get: async (key: string) => (await db.select().from(settings).where(eq(settings.key, key)))[0]?.value,
  many: (keys: string[]) => db.select().from(settings).where(inArray(settings.key, keys)),
  upsert: async (key: string, value: Record<string, unknown>) => (await db.insert(settings).values({ key, value })
    .onConflictDoUpdate({ target: settings.key, set: { value, updatedAt: new Date() } }).returning())[0],
});
