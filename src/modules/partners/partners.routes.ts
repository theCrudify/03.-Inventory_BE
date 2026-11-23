import { newRouter } from '../../core/env';
import { canWrite } from '../../core/middleware';
import { partnersController as ctl } from './partners.controller';

export const partnersRoutes = newRouter()
  .get('/', ctl.list)
  .post('/', canWrite, ctl.create)
  .put('/:id', canWrite, ctl.update)
  .delete('/:id', canWrite, ctl.remove);
