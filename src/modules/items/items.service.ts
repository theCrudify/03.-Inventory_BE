import type { Db } from '../../core/db/client';
import type { AuthUser } from '../../core/env';
import { notFound } from '../../core/errors';
import { envelope } from '../../core/http';
import { createAuditService } from '../audit/audit.service';
import { createCustomsDocsService } from '../customs-docs/customs-docs.service';
import { createRefsService } from '../refs/refs.service';
import type { ItemBody, ItemListQuery } from './items.dto';
import { createItemsRepository } from './items.repository';

export function createItemsService(db: Db) {
  const repo = createItemsRepository(db);
  const refs = createRefsService(db);
  const audit = createAuditService(db);

  async function validate(b: ItemBody) {
    await refs.assertCode('kategori_barang', b.category, 'Kategori');
    await refs.assertCode('satuan', b.uom, 'Satuan');
    await refs.assertCode('hs', b.hsCode, 'HS code');
  }

  return {
    async list(p: ItemListQuery) {
      // Stock is derived from approved documents; settle pending CEISA responses first.
      await createCustomsDocsService(db).advanceInFlight();
      return envelope(await repo.list(p), p);
    },
    async create(actor: AuthUser, b: ItemBody) {
      await validate(b);
      const row = await repo.insert(b);
      await audit.log(actor, { action: 'create', entity: 'item', entityId: row.id, data: { code: row.code } });
      return row;
    },
    async update(actor: AuthUser, id: number, b: ItemBody) {
      await validate(b);
      const row = await repo.update(id, b);
      if (!row) throw notFound('Barang');
      await audit.log(actor, { action: 'update', entity: 'item', entityId: id });
      return row;
    },
    async remove(actor: AuthUser, id: number) {
      const row = await repo.remove(id);
      if (!row) throw notFound('Barang');
      await audit.log(actor, { action: 'delete', entity: 'item', entityId: id, data: { code: row.code } });
    },
  };
}
