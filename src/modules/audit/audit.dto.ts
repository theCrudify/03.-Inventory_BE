import { pageQuery } from '../../core/http';

export const auditListQuery = pageQuery;
export type AuditEntry = { action: string; entity: string; entityId?: number; data?: Record<string, unknown> };
