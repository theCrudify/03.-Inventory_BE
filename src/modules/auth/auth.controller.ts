import type { Ctx } from '../../core/env';
import { body } from '../../core/http';
import { clientIp } from '../../core/security';
import { changePasswordBody, loginBody } from './auth.dto';
import { createAuthService } from './auth.service';

const svc = (c: Ctx) => createAuthService(c.get('db'), c.env.JWT_SECRET, c.get('config'));

export const authController = {
  login: async (c: Ctx) => c.json(await svc(c).login({ ip: clientIp(c) }, await body(c, loginBody))),
  me: (c: Ctx) => c.json(c.get('user')),
  changePassword: async (c: Ctx) => { await svc(c).changePassword(c.get('user'), await body(c, changePasswordBody)); return c.json({ ok: true }); },
};
