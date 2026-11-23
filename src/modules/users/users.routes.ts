import { newRouter } from '../../core/env';
import { adminOnly } from '../../core/middleware';
import { usersController as ctl } from './users.controller';

export const usersRoutes = newRouter()
  .use('*', adminOnly)
  .get('/', ctl.list)
  .post('/', ctl.create)
  .put('/:id', ctl.update)
  .delete('/:id', ctl.remove);
