import { Hono, type Context } from 'hono';
import type { AppConfig } from './config';
import type { Db } from './db/client';

/** `role` is a refs code; its permissions (from the role's meta) are resolved at login and carried in the token. */
export type AuthUser = { id: number; name: string; email: string; role: string; canWrite: boolean; isAdmin: boolean };
export type Env = {
  /** Required: DATABASE_URL, JWT_SECRET, CORS_ORIGINS. Optional tunables are documented in `core/config.ts` and `.env.example`. */
  Bindings: { DATABASE_URL: string; JWT_SECRET: string; CORS_ORIGINS: string } & Partial<Record<keyof typeof import('./config').DEFAULTS | 'CORS_ALLOW_LOCALHOST', string>>;
  Variables: { db: Db; user: AuthUser; config: AppConfig };
};
export type Ctx = Context<Env>;
export const newRouter = () => new Hono<Env>();
