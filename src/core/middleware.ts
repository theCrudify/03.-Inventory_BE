import type { MiddlewareHandler } from 'hono';
import { createDb } from './db/client';
import type { AuthUser, Env } from './env';
export type { AuthUser };
import { httpError } from './errors';

/** One DB client per request (Workers can't share sockets across requests). */
export const withDb: MiddlewareHandler<Env> = async (c, next) => {
  const { db, close } = createDb(c.env.DATABASE_URL);
  c.set('db', db);
  try {
    await next();
  } finally {
    c.executionCtx.waitUntil(close());
  }
};

const requirePermission = (perm: 'canWrite' | 'isAdmin'): MiddlewareHandler<Env> => async (c, next) => {
  if (!c.get('user')[perm]) throw httpError(403, 'Anda tidak memiliki akses untuk aksi ini');
  await next();
};
export const canWrite = requirePermission('canWrite');
export const adminOnly = requirePermission('isAdmin');
