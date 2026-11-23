import { asc, eq } from 'drizzle-orm';
import type { Db } from '../../core/db/client';
import { appFeatures, appSettings, companyProfile, demoAccounts, users } from '../../core/db/schema';

type CompanyRow = typeof companyProfile.$inferInsert;
type AppRow = typeof appSettings.$inferInsert;

export const createSettingsRepository = (db: Db) => ({
  company: async () => (await db.select().from(companyProfile).where(eq(companyProfile.id, 1)))[0],
  upsertCompany: (row: Omit<CompanyRow, 'id'>) => db.insert(companyProfile).values({ ...row, id: 1 })
    .onConflictDoUpdate({ target: companyProfile.id, set: { ...row, updatedAt: new Date() } }),

  app: async () => (await db.select().from(appSettings).where(eq(appSettings.id, 1)))[0],
  features: () => db.select({ text: appFeatures.text }).from(appFeatures).orderBy(asc(appFeatures.sort), asc(appFeatures.id)),
  demoAccounts: () => db.select({ email: users.email, label: demoAccounts.label, description: demoAccounts.description })
    .from(demoAccounts).innerJoin(users, eq(users.id, demoAccounts.userId)).orderBy(asc(demoAccounts.sort), asc(demoAccounts.id)),
  /** Accounts offered on the login page are shared identities: they must not be changed or deleted through the API. */
  isDemoUser: async (userId: number) => !!(await db.select({ id: demoAccounts.id }).from(demoAccounts).where(eq(demoAccounts.userId, userId)))[0],

  /** Replace the application profile and its feature list atomically. Demo accounts are never touched here. */
  saveApp: (row: Omit<AppRow, 'id' | 'demoPassword'>, features: string[]) => db.transaction(async (tx) => {
    await tx.insert(appSettings).values({ ...row, id: 1 }).onConflictDoUpdate({ target: appSettings.id, set: { ...row, updatedAt: new Date() } });
    await tx.delete(appFeatures);
    if (features.length) await tx.insert(appFeatures).values(features.map((text, sort) => ({ text, sort })));
  }),
});
