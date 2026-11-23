import type { Db } from '../../core/db/client';
import type { AuthUser } from '../../core/env';
import { notFound } from '../../core/errors';
import { createAuditService } from '../audit/audit.service';
import { createRefsService } from '../refs/refs.service';
import { META_REF_TYPES, settingSchemas, type CompanySettings, type SettingKey } from './settings.dto';
import { createSettingsRepository } from './settings.repository';

export function createSettingsService(db: Db) {
  const repo = createSettingsRepository(db);
  const refs = createRefsService(db);
  const audit = createAuditService(db);

  async function read<K extends keyof typeof settingSchemas>(key: K) {
    const v = await repo.get(key);
    if (!v) throw notFound(`Pengaturan "${key}"`);
    return settingSchemas[key].parse(v);
  }

  return {
    company: () => read('company') as Promise<CompanySettings>,
    /** Unauthenticated: only what the login page needs. */
    publicMeta: async () => ({ app: await read('app') }),
    /** Everything the UI renders labels/options from, in one request. */
    async meta() {
      const [company, app, rows] = await Promise.all([read('company'), read('app'), refs.byTypes(META_REF_TYPES)]);
      const grouped: Record<string, typeof rows> = {};
      for (const r of rows) (grouped[r.type] ??= []).push(r);
      return { company, app, refs: grouped };
    },
    async update(actor: AuthUser, key: SettingKey, value: unknown) {
      const parsed = settingSchemas[key].parse(value);
      const row = await repo.upsert(key, parsed);
      await audit.log(actor, { action: 'update', entity: `settings_${key}` });
      return row.value;
    },
  };
}
