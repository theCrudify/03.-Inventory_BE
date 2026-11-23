import { newRouter } from '../../core/env';
import { canWrite } from '../../core/middleware';
import { itemsController as ctl } from './items.controller';

export const itemsRoutes = newRouter()
  .get('/', ctl.list)
  .post('/', canWrite, ctl.create)
  .put('/:id', canWrite, ctl.update)
  .delete('/:id', canWrite, ctl.remove);
