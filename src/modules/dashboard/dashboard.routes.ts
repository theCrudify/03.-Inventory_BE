import { newRouter } from '../../core/env';
import { dashboardController as ctl } from './dashboard.controller';

export const dashboardRoutes = newRouter().get('/', ctl.summary);
