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

  const lineRows = (b: TradeDocBody) => b.lines.map((l) => ({ itemId: l.itemId, qty: String(l.qty), unitPrice: String(l.unitPrice) }));
  /** Attach each document's lines (as numbers) to the rows. */
  async function withLines<T extends { id: number }>(rows: T[]) {
    const lines = await repo.lines(rows.map((r) => r.id));
    return rows.map((r) => ({ ...r, lines: lines.filter((l) => l.tradeDocId === r.id).map((l) => ({ itemId: l.itemId, qty: Number(l.qty), unitPrice: Number(l.unitPrice) })) }));
  }

  return {
    async list(p: TradeDocListQuery) {
      const page = envelope(await repo.list(p), p);
      return { ...page, data: await withLines(page.data) };
    },
    async get(id: number) {
      const row = await repo.byId(id);
      if (!row) throw notFound('Dokumen');
      return (await withLines([row]))[0];
    },
    async create(actor: AuthUser, b: TradeDocBody) {
      await validate(b);
      const row = await repo.insert({ kind: b.kind, number: b.number, date: b.date, partnerId: b.partnerId, currency: b.currency, incoterm: b.incoterm ?? null, total: total(b.lines) }, lineRows(b));
      await audit.log(actor, { action: 'create', entity: b.kind, entityId: row.id, data: { number: row.number } });
      return (await withLines([row]))[0];
    },
    async update(actor: AuthUser, id: number, b: TradeDocBody) {
      await validate(b);
      const row = await repo.update(id, { kind: b.kind, number: b.number, date: b.date, partnerId: b.partnerId, currency: b.currency, incoterm: b.incoterm ?? null, total: total(b.lines) }, lineRows(b));
      if (!row) throw notFound('Dokumen');
      await audit.log(actor, { action: 'update', entity: b.kind, entityId: id });
      return (await withLines([row]))[0];
    },
    async remove(actor: AuthUser, id: number) {
      const row = await repo.remove(id);
      if (!row) throw notFound('Dokumen');
      await audit.log(actor, { action: 'delete', entity: row.kind, entityId: id, data: { number: row.number } });
    },
  };
}
