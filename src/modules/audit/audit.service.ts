import type { Db } from '../../core/db/client';
import type { AuthUser } from '../../core/env';
import { envelope } from '../../core/http';
import type { AuditEntry, AuditListQuery } from './audit.dto';
import { createAuditRepository } from './audit.repository';

export function createAuditService(db: Db) {
  const repo = createAuditRepository(db);
  return {
    /** `data` carries the one attribute that identifies the subject (code, aju, email …); it is stored as ref_key/ref_value. */
    log(actor: Pick<AuthUser, 'id'> | null, { data, ...e }: AuditEntry) {
      const [refKey, refValue] = Object.entries(data ?? {})[0] ?? [];
      return repo.insert({ userId: actor?.id, ...e, refKey: refKey ?? null, refValue: refValue === undefined ? null : String(refValue) });
    },
    /** The API keeps returning `data: { <refKey>: <refValue> }` so clients are unaffected by the relational storage. */
    async list(p: AuditListQuery) {
      const page = envelope(await repo.list(p), p);
      return { ...page, data: page.data.map(({ refKey, refValue, ...r }) => ({ ...r, data: refKey ? { [refKey]: refValue } : null })) };
    },
  };
}
export type AuditService = ReturnType<typeof createAuditService>;
