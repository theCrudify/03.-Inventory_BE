import type { Ctx } from '../../core/env';
import { query } from '../../core/http';
import { auditListQuery } from './audit.dto';
import { createAuditService } from './audit.service';

export const auditController = {
  list: async (c: Ctx) => c.json(await createAuditService(c.get('db')).list(query(c, auditListQuery))),
};
