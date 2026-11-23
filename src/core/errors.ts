import type { Context } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { ZodError } from 'zod';

export const httpError = (status: ContentfulStatusCode, message: string) => new HTTPException(status, { message });
export const badRequest = (m: string) => httpError(400, m);
export const notFound = (what: string) => httpError(404, `${what} tidak ditemukan`);
export const conflict = (m: string) => httpError(409, m);
export const unprocessable = (m: string) => httpError(422, m);

/** 429 carrying how long the client must wait (sent as `Retry-After`). */
export class RateLimitError extends HTTPException {
  constructor(message: string, public retryAfterSec: number) { super(429, { message }); }
}

export function onError(err: Error, c: Context) {
  if (err instanceof RateLimitError) return c.json({ message: err.message }, 429, { 'Retry-After': String(err.retryAfterSec) });
  if (err instanceof HTTPException) return c.json({ message: err.message }, err.status);
  if (err instanceof ZodError) {
    return c.json({ message: 'Data tidak valid', errors: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) }, 400);
  }
  const pg = err as { code?: string; cause?: { code?: string } };
  const code = pg.code ?? pg.cause?.code;
  if (code === '23505') return c.json({ message: 'Data dengan kode/nomor tersebut sudah ada' }, 409);
  if (code === '23503') return c.json({ message: 'Data masih dipakai oleh data lain' }, 409);
  if (code === '22001') return c.json({ message: 'Isian terlalu panjang' }, 400);
  if (code === '23514') return c.json({ message: 'Nilai tidak memenuhi aturan data' }, 400);
  console.error(err);
  return c.json({ message: 'Terjadi kesalahan pada server' }, 500);
}
