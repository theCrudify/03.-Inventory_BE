import { newRouter } from '../../core/env';
import { adminOnly } from '../../core/middleware';
import { documentStatusesController as ctl } from './document-statuses.controller';

export const documentStatusesRoutes = newRouter()
  .get('/', ctl.list)
  .post('/', adminOnly, ctl.create)
  .put('/:code', adminOnly, ctl.update)
  .delete('/:code', adminOnly, ctl.remove);
