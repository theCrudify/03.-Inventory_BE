import type { Db } from '../../core/db/client';
import type { AuthUser } from '../../core/env';
import { envelope, type PageQuery } from '../../core/http';
import type { AuditEntry } from './audit.dto';
import { createAuditRepository } from './audit.repository';

export function createAuditService(db: Db) {
  const repo = createAuditRepository(db);
  return {
    log: (actor: Pick<AuthUser, 'id'> | null, e: AuditEntry) => repo.insert({ userId: actor?.id, ...e }),
    list: async (p: PageQuery) => envelope(await repo.list(p), p),
  };
}
export type AuditService = ReturnType<typeof createAuditService>;
