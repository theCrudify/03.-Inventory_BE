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
  userIdsByEmail: async (emails: string[]) => new Map((await db.select({ id: users.id, email: users.email }).from(users)).filter((u) => emails.includes(u.email)).map((u) => [u.email, u.id])),

  /** Replace the whole application profile (row, features, demo accounts) atomically. */
  saveApp: (row: Omit<AppRow, 'id'>, features: string[], accounts: { userId: number; label: string; description: string }[]) => db.transaction(async (tx) => {
    await tx.insert(appSettings).values({ ...row, id: 1 }).onConflictDoUpdate({ target: appSettings.id, set: { ...row, updatedAt: new Date() } });
    await tx.delete(appFeatures);
    if (features.length) await tx.insert(appFeatures).values(features.map((text, sort) => ({ text, sort })));
    await tx.delete(demoAccounts);
    if (accounts.length) await tx.insert(demoAccounts).values(accounts.map((a, sort) => ({ ...a, sort })));
  }),
});
