import { newRouter } from '../../core/env';
import { ceisaMockController as ctl } from './ceisa-mock.controller';

export const ceisaMockRoutes = newRouter()
  .post('/nle-oauth/v1/user/login', ctl.login)
  .get('/openapi/status/:aju', ctl.auth, ctl.status);
