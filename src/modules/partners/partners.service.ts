import type { Db } from '../../core/db/client';
import type { AuthUser } from '../../core/env';
import { notFound } from '../../core/errors';
import { envelope } from '../../core/http';
import { createAuditService } from '../audit/audit.service';
import { createRefsService } from '../refs/refs.service';
import type { PartnerBody, PartnerListQuery } from './partners.dto';
import { createPartnersRepository } from './partners.repository';

export function createPartnersService(db: Db) {
  const repo = createPartnersRepository(db);
  const refs = createRefsService(db);
  const audit = createAuditService(db);

  async function validate(b: PartnerBody) {
    await refs.assertCode('jenis_mitra', b.kind, 'Jenis mitra');
    await refs.assertCode('negara', b.countryCode, 'Negara');
  }

  return {
    list: async (p: PartnerListQuery) => envelope(await repo.list(p), p),
    byId: repo.byId,
    async create(actor: AuthUser, b: PartnerBody) {
      await validate(b);
      const row = await repo.insert(b);
      await audit.log(actor, { action: 'create', entity: 'partner', entityId: row.id, data: { name: row.name } });
      return row;
    },
    async update(actor: AuthUser, id: number, b: PartnerBody) {
      await validate(b);
      const row = await repo.update(id, b);
      if (!row) throw notFound('Mitra');
      await audit.log(actor, { action: 'update', entity: 'partner', entityId: id });
      return row;
    },
    async remove(actor: AuthUser, id: number) {
      const row = await repo.remove(id);
      if (!row) throw notFound('Mitra');
      await audit.log(actor, { action: 'delete', entity: 'partner', entityId: id, data: { name: row.name } });
    },
  };
}
