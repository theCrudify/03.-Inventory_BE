import { and, desc, eq, sql, type SQL } from 'drizzle-orm';
import type { Db } from '../../core/db/client';
import { auditLogs, users } from '../../core/db/schema';
import { orderByFor, searchSql, toLimit } from '../../core/http';
import type { AuditListQuery } from './audit.dto';

export const createAuditRepository = (db: Db) => ({
  insert: (row: typeof auditLogs.$inferInsert) => db.insert(auditLogs).values(row),

  list: (p: AuditListQuery) => {
    const where: SQL[] = [];
    const search = searchSql(p.q, [
      users.name, auditLogs.action, auditLogs.entity,
      sql`${auditLogs.entityId}::text`, auditLogs.refKey, auditLogs.refValue,
    ]);
    if (search) where.push(search);
    if (p.action) where.push(eq(auditLogs.action, p.action));
    if (p.entity) where.push(eq(auditLogs.entity, p.entity));
    const order = orderByFor(
      { createdAt: auditLogs.createdAt, userName: users.name, action: auditLogs.action, entity: auditLogs.entity },
      p.sortBy, p.sortDir, [desc(auditLogs.createdAt), desc(auditLogs.id)],
    );
    return db.select({
      id: auditLogs.id, action: auditLogs.action, entity: auditLogs.entity, entityId: auditLogs.entityId, refKey: auditLogs.refKey, refValue: auditLogs.refValue,
      createdAt: auditLogs.createdAt, userName: users.name, total: sql<number>`count(*) over()`.mapWith(Number),
    }).from(auditLogs).leftJoin(users, eq(users.id, auditLogs.userId))
      .where(and(...where)).orderBy(...order).limit(toLimit(p).limit).offset(toLimit(p).offset);
  },
});
