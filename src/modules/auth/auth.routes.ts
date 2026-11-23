import { newRouter } from '../../core/env';
import { requireAuth } from './auth.middleware';
import { authController as ctl } from './auth.controller';

export const authRoutes = newRouter()
  .post('/login', ctl.login)
  .get('/me', requireAuth, ctl.me)
  .post('/change-password', requireAuth, ctl.changePassword);
