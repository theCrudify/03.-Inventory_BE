import type { Db } from '../../core/db/client';
import type { AuthUser } from '../../core/env';
import { notFound } from '../../core/errors';
import { envelope } from '../../core/http';
import { createAuditService } from '../audit/audit.service';
import { createRefsService } from '../refs/refs.service';
import type { TradeDocBody, TradeDocListQuery } from './trade-docs.dto';
import { createTradeDocsRepository } from './trade-docs.repository';

const total = (lines: TradeDocBody['lines']) => lines.reduce((s, l) => s + l.qty * l.unitPrice, 0).toFixed(2);

export function createTradeDocsService(db: Db) {
  const repo = createTradeDocsRepository(db);
  const refs = createRefsService(db);
  const audit = createAuditService(db);

  async function validate(b: TradeDocBody) {
    await refs.assertCode('jenis_sumber', b.kind, 'Jenis dokumen');
    await refs.assertCode('valuta', b.currency, 'Valuta');
    await refs.assertCode('incoterm', b.incoterm, 'Incoterm');
  }

  return {
    list: async (p: TradeDocListQuery) => envelope(await repo.list(p), p),
    async get(id: number) {
      const row = await repo.byId(id);
      if (!row) throw notFound('Dokumen');
      return row;
    },
    async create(actor: AuthUser, b: TradeDocBody) {
      await validate(b);
      const row = await repo.insert({ ...b, total: total(b.lines) });
      await audit.log(actor, { action: 'create', entity: b.kind, entityId: row.id, data: { number: row.number } });
      return row;
    },
    async update(actor: AuthUser, id: number, b: TradeDocBody) {
      await validate(b);
      const row = await repo.update(id, { ...b, total: total(b.lines) });
      if (!row) throw notFound('Dokumen');
      await audit.log(actor, { action: 'update', entity: b.kind, entityId: id });
      return row;
    },
    async remove(actor: AuthUser, id: number) {
      const row = await repo.remove(id);
      if (!row) throw notFound('Dokumen');
      await audit.log(actor, { action: 'delete', entity: row.kind, entityId: id, data: { number: row.number } });
    },
  };
}
