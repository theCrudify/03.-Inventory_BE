import { newRouter } from '../../core/env';
import { adminOnly } from '../../core/middleware';
import { auditController as ctl } from './audit.controller';

export const auditRoutes = newRouter().get('/', adminOnly, ctl.list);
