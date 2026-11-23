import type { Db } from '../../core/db/client';
import type { AuthUser } from '../../core/env';
import { badRequest, notFound } from '../../core/errors';
import { createAuditService } from '../audit/audit.service';
import { createDocumentStatusesService } from '../document-statuses/document-statuses.service';
import { createRefsService } from '../refs/refs.service';
import { createRolesService } from '../roles/roles.service';
import { appSettings, companySettings, type AppSettings, type CompanySettings, type SettingKey } from './settings.dto';
import { createSettingsRepository } from './settings.repository';

export function createSettingsService(db: Db) {
  const repo = createSettingsRepository(db);
  const refs = createRefsService(db);
  const roles = createRolesService(db);
  const statuses = createDocumentStatusesService(db);
  const audit = createAuditService(db);

  async function company(): Promise<CompanySettings> {
    const r = await repo.company();
    if (!r) throw notFound('Pengaturan "company"');
    return {
      name: r.name, npwp: r.npwp, izinKb: r.izinKb, companyId: r.companyId, address: r.address, city: r.city, timezone: r.timezone,
      signatory: { name: r.signatoryName, title: r.signatoryTitle },
    };
  }

  async function app(): Promise<AppSettings> {
    const [r, features, accounts] = await Promise.all([repo.app(), repo.features(), repo.demoAccounts()]);
    if (!r) throw notFound('Pengaturan "app"');
    return {
      name: r.name, subtitle: r.subtitle, tagline: r.tagline, description: r.description, features: features.map((f) => f.text),
      environmentLabel: r.environmentLabel, footnote: r.footnote, printHeader: r.printHeader, printFootnote: r.printFootnote,
      demo: accounts.length || r.demoPassword ? { password: r.demoPassword ?? '', accounts } : null,
    };
  }

  return {
    company,
    /** Unauthenticated: only what the login page needs. */
    publicMeta: async () => ({ app: await app() }),
    /** Everything the UI renders labels/options from, in one request. */
    async meta() {
      const [c, a, refMap, roleRows, statusRows] = await Promise.all([company(), app(), refs.allForMeta(), roles.list(), statuses.list()]);
      return { company: c, app: a, refs: refMap, roles: roleRows, statuses: statusRows };
    },
    async update(actor: AuthUser, key: SettingKey, value: unknown) {
      if (key === 'company') {
        const c = companySettings.parse(value);
        await repo.upsertCompany({
          name: c.name, npwp: c.npwp, izinKb: c.izinKb, companyId: c.companyId, address: c.address, city: c.city, timezone: c.timezone,
          signatoryName: c.signatory.name, signatoryTitle: c.signatory.title,
        });
        await audit.log(actor, { action: 'update', entity: 'settings_company' });
        return company();
      }
      const a = appSettings.parse(value);
      const emails = a.demo?.accounts.map((x) => x.email) ?? [];
      const ids = await repo.userIdsByEmail(emails);
      const unknown = emails.find((e) => !ids.has(e));
      if (unknown) throw badRequest(`Akun demo "${unknown}" bukan pengguna terdaftar`);
      await repo.saveApp(
        {
          name: a.name, subtitle: a.subtitle, tagline: a.tagline, description: a.description, environmentLabel: a.environmentLabel,
          footnote: a.footnote, printHeader: a.printHeader, printFootnote: a.printFootnote, demoPassword: a.demo?.password ?? null,
        },
        a.features,
        (a.demo?.accounts ?? []).map((x) => ({ userId: ids.get(x.email)!, label: x.label, description: x.description })),
      );
      await audit.log(actor, { action: 'update', entity: 'settings_app' });
      return app();
    },
  };
}
