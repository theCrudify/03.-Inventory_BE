import { newRouter } from '../../core/env';
import { adminOnly } from '../../core/middleware';
import { refsController as ctl } from './refs.controller';

export const refsRoutes = newRouter()
  .get('/:type', ctl.list)
  .post('/:type', adminOnly, ctl.create)
  .put('/:type/:id', adminOnly, ctl.update)
  .delete('/:type/:id', adminOnly, ctl.remove);

export const inswRoutes = newRouter().get('/hs/:code', ctl.insw);
