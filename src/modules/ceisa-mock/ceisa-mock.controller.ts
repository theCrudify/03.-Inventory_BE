import type { MiddlewareHandler } from 'hono';
import type { Ctx, Env } from '../../core/env';
import { ceisaFail, ceisaLoginBody } from './ceisa-mock.dto';
import { createCeisaMockService } from './ceisa-mock.service';

const svc = (c: Ctx) => createCeisaMockService(c.get('db'), c.env.JWT_SECRET);

export const ceisaMockController = {
  login: async (c: Ctx) => {
    const parsed = ceisaLoginBody.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) return c.json(ceisaFail('username dan password wajib diisi'), 400);
    return c.json(await svc(c).login(parsed.data));
  },
  status: async (c: Ctx) => {
    const r = await svc(c).status(c.req.param('aju') ?? '');
    return r ? c.json(r) : c.json(ceisaFail('Nomor aju tidak ditemukan'), 404);
  },
  /** Gateway-style auth: errors use the CEISA envelope, not the app's. */
  auth: (async (c, next) => {
    const token = c.req.header('authorization')?.replace(/^Bearer /, '') ?? '';
    const ok = await svc(c).verifyToken(token).catch(() => false);
    if (!ok) return c.json(ceisaFail('Token tidak valid atau kedaluwarsa'), 401);
    await next();
  }) as MiddlewareHandler<Env>,
};
