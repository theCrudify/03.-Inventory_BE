import { desc, eq, sql } from 'drizzle-orm';
import type { Db } from '../../core/db/client';
import { auditLogs, users } from '../../core/db/schema';
import { toLimit, type PageQuery } from '../../core/http';

export const createAuditRepository = (db: Db) => ({
  insert: (row: typeof auditLogs.$inferInsert) => db.insert(auditLogs).values(row),

  list: (p: PageQuery) => db.select({
    id: auditLogs.id, action: auditLogs.action, entity: auditLogs.entity, entityId: auditLogs.entityId, data: auditLogs.data,
    createdAt: auditLogs.createdAt, userName: users.name, total: sql<number>`count(*) over()`.mapWith(Number),
  }).from(auditLogs).leftJoin(users, eq(users.id, auditLogs.userId))
    .orderBy(desc(auditLogs.createdAt)).limit(toLimit(p).limit).offset(toLimit(p).offset),
});
