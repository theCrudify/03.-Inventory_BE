import type { Db } from '../../core/db/client';
import type { DocumentStatus } from '../../core/db/schema';
import type { AuthUser } from '../../core/env';
import { badRequest, conflict, httpError, notFound } from '../../core/errors';
import { createAuditService } from '../audit/audit.service';
import type { StatusBody } from './document-statuses.dto';
import { createDocumentStatusesRepository } from './document-statuses.repository';

export function createDocumentStatusesService(db: Db) {
  const repo = createDocumentStatusesRepository(db);
  const audit = createAuditService(db);

  /** A new/edited document needs exactly one initial status (the database also enforces "at most one"). */
  async function assertInitialRules(code: string, initial: boolean) {
    const others = (await repo.list()).filter((s) => s.code !== code && s.initial);
    if (initial && others.length) throw conflict(`Status awal sudah ada ("${others[0].code}"). Lepas dulu dari status tersebut.`);
    if (!initial && !others.length) throw badRequest('Harus ada tepat satu status awal');
  }

  return {
    list: repo.list,

    /** Document lifecycle derived from the status flags. Throws 500 if the master has no initial status. */
    async lifecycle() {
      const all = await repo.list();
      const codes = (f: keyof DocumentStatus) => all.filter((s) => s[f] === true).map((s) => s.code);
      const initial = codes('initial')[0];
      if (!initial) throw httpError(500, 'Master document_statuses belum memiliki status awal (initial)');
      return { all, initial, editable: codes('editable'), inFlight: codes('inFlight'), registered: codes('registered'), approved: codes('approved'), rejected: codes('rejected') };
    },

    /** Throws 400 unless `code` exists in the master (used to validate status filters). */
    async assertCode(code: string | undefined) {
      if (code && !(await repo.find(code))) throw badRequest(`Status "${code}" tidak terdaftar`);
    },

    async create(actor: AuthUser, b: StatusBody) {
      if (b.initial) await assertInitialRules(b.code, true);
      const row = await repo.insert(b);
      await audit.log(actor, { action: 'create', entity: 'document_status', data: { code: row.code } });
      return row;
    },
    async update(actor: AuthUser, code: string, b: StatusBody) {
      if (b.code !== code) throw badRequest('Kode status tidak dapat diubah');
      if (!(await repo.find(code))) throw notFound('Status');
      await assertInitialRules(code, b.initial);
      const row = await repo.update(code, b);
      await audit.log(actor, { action: 'update', entity: 'document_status', data: { code } });
      return row;
    },
    /** Fails with 409 (foreign key) while any document or CEISA event still uses the status. */
    async remove(actor: AuthUser, code: string) {
      const cur = await repo.find(code);
      if (!cur) throw notFound('Status');
      if (cur.initial) throw badRequest('Status awal tidak dapat dihapus');
      await repo.remove(code);
      await audit.log(actor, { action: 'delete', entity: 'document_status', data: { code } });
    },
  };
}
export type DocumentStatusesService = ReturnType<typeof createDocumentStatusesService>;
