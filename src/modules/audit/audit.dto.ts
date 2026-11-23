import { z } from 'zod';
import { pageQuery } from '../../core/http';

export const auditListQuery = pageQuery.extend({
  action: z.string().trim().optional(),
  entity: z.string().trim().optional(),
});
export type AuditListQuery = z.infer<typeof auditListQuery>;
export type AuditEntry = { action: string; entity: string; entityId?: number; data?: Record<string, unknown> };
