import { newRouter } from '../../core/env';
import { reportsController as ctl } from './reports.controller';

export const reportsRoutes = newRouter().get('/mutasi', ctl.mutasi);
