import { newRouter } from '../../core/env';
import { canWrite } from '../../core/middleware';
import { customsDocsController as ctl } from './customs-docs.controller';

export const customsDocsRoutes = newRouter()
  .get('/', ctl.list)
  .get('/:id', ctl.get)
  .post('/', canWrite, ctl.create)
  .put('/:id', canWrite, ctl.update)
  .delete('/:id', canWrite, ctl.remove)
  .post('/:id/submit', canWrite, ctl.submit);
