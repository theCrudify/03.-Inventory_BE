import { newRouter } from '../../core/env';
import { adminOnly } from '../../core/middleware';
import { rolesController as ctl } from './roles.controller';

export const rolesRoutes = newRouter()
  .get('/', ctl.list)
  .post('/', adminOnly, ctl.create)
  .put('/:code', adminOnly, ctl.update)
  .delete('/:code', adminOnly, ctl.remove);
