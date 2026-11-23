import type { MiddlewareHandler } from 'hono';
import { verify } from 'hono/jwt';
import type { AuthUser, Env } from '../../core/env';
import { httpError } from '../../core/errors';
import { APP_AUDIENCE, bearerToken, signingSecret } from '../../core/security';
import { createAuthRepository } from './auth.repository';

/**
 * Authenticates a request. The token only proves identity (`sub`) and which session generation it belongs to (`tv`);
 * the user, their role and permissions are re-read from the database every time, so a demoted, deleted, or
 * password-changed user loses access immediately instead of when the token expires.
 */
export const requireAuth: MiddlewareHandler<Env> = async (c, next) => {
  const token = bearerToken(c);
  if (!token) throw httpError(401, 'Silakan login terlebih dahulu');
  const secret = signingSecret(c.env.JWT_SECRET, APP_AUDIENCE);
  const expired = httpError(401, 'Sesi berakhir, silakan login kembali');
  let payload: Awaited<ReturnType<typeof verify>>;
  try {
    payload = await verify(token, secret, { alg: 'HS256', aud: APP_AUDIENCE });
  } catch {
    throw expired;
  }
  const id = Number(payload.sub);
  if (!Number.isInteger(id) || id <= 0 || typeof payload.tv !== 'number') throw expired;
  const s = await createAuthRepository(c.get('db')).session(id);
  if (!s || s.tokenVersion !== payload.tv) throw expired;
  const user: AuthUser = { id: s.id, name: s.name, email: s.email, role: s.role, canWrite: s.canWrite, isAdmin: s.isAdmin };
  c.set('user', user);
  await next();
};
