import { z } from 'zod';
import type { Ctx } from './env';
import { httpError } from './errors';

/** Token audiences. A token is only accepted by the audience it was issued for. */
export const APP_AUDIENCE = 'inventory-app';
export const CEISA_AUDIENCE = 'ceisa-mock';

/**
 * Signing key for a purpose. Each purpose gets its own key derived from the one secret, so a token minted for
 * one purpose (e.g. the public CEISA mock gateway) can never verify as another (the application API).
 */
export function signingSecret(secret: string | undefined, purpose: typeof APP_AUDIENCE | typeof CEISA_AUDIENCE) {
  if (!secret || secret.length < 32) throw httpError(500, 'Konfigurasi server tidak aman: JWT_SECRET minimal 32 karakter');
  return `${secret}::${purpose}`;
}

export const bearerToken = (c: Ctx) => c.req.header('authorization')?.replace(/^Bearer\s+/i, '') || undefined;
/** Client address as seen by Cloudflare (falls back for local runs). */
export const clientIp = (c: Ctx) => c.req.header('cf-connecting-ip') ?? c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';

/** Password policy for new passwords: length, mixed character classes, no obvious reuse of the identity. */
export const passwordRule = z.string()
  .min(10, 'Password minimal 10 karakter')
  .max(128, 'Password maksimal 128 karakter')
  .refine((p) => /[A-Za-z]/.test(p) && /\d/.test(p), 'Password harus mengandung huruf dan angka');
