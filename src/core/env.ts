import { Hono, type Context } from 'hono';
import type { Db } from './db/client';

/** `role` is a refs code; its permissions (from the role's meta) are resolved at login and carried in the token. */
export type AuthUser = { id: number; name: string; email: string; role: string; canWrite: boolean; isAdmin: boolean };
export type Env = {
  Bindings: { DATABASE_URL: string; JWT_SECRET: string; CORS_ORIGINS: string };
  Variables: { db: Db; user: AuthUser };
};
export type Ctx = Context<Env>;
export const newRouter = () => new Hono<Env>();
