import { newRouter } from '../../core/env';
import { canWrite } from '../../core/middleware';
import { tradeDocsController as ctl } from './trade-docs.controller';

export const tradeDocsRoutes = newRouter()
  .get('/', ctl.list)
  .get('/:id', ctl.get)
  .post('/', canWrite, ctl.create)
  .put('/:id', canWrite, ctl.update)
  .delete('/:id', canWrite, ctl.remove);
