import { newRouter } from '../../core/env';
import { adminOnly } from '../../core/middleware';
import { settingsController as ctl } from './settings.controller';

/** Mounted before auth: login page branding. */
export const publicMetaRoutes = newRouter().get('/public', ctl.publicMeta);
export const metaRoutes = newRouter().get('/', ctl.meta);
export const settingsRoutes = newRouter().put('/:key', adminOnly, ctl.update);
