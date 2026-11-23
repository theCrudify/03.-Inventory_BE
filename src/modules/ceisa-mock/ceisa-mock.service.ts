import { sign, verify } from 'hono/jwt';
import type { z } from 'zod';
import type { Db } from '../../core/db/client';
import { CEISA_AUDIENCE, signingSecret } from '../../core/security';
import { createCustomsDocsService } from '../customs-docs/customs-docs.service';
import { CEISA_TOKEN_SCOPE, CEISA_TOKEN_TTL_SEC, type ceisaLoginBody } from './ceisa-mock.dto';

/** Mock of the CEISA 4.0 host-to-host gateway (same paths and response shape as the real one). */
export function createCeisaMockService(db: Db, jwtSecret: string) {
  // A key of its own: gateway tokens are public to mint, so they must never verify against the application API.
  const secret = () => signingSecret(jwtSecret, CEISA_AUDIENCE);
  const customs = createCustomsDocsService(db);
  return {
    async login(b: z.infer<typeof ceisaLoginBody>) {
      const now = Math.floor(Date.now() / 1000);
      const access_token = await sign({ sub: b.username, aud: CEISA_AUDIENCE, scope: CEISA_TOKEN_SCOPE, iat: now, exp: now + CEISA_TOKEN_TTL_SEC }, secret());
      return { status: 'success', message: 'Login berhasil', item: { access_token, refresh_token: crypto.randomUUID(), expires_in: CEISA_TOKEN_TTL_SEC, token_type: 'Bearer' } };
    },
    async verifyToken(token: string) {
      const p = await verify(token, secret(), { alg: 'HS256', aud: CEISA_AUDIENCE });
      return p.scope === CEISA_TOKEN_SCOPE;
    },
    async status(aju: string) {
      const found = await customs.byAju(aju);
      if (!found) return null;
      return {
        status: 'OK',
        message: 'Berhasil',
        dataStatus: found.events.map((e) => ({
          nomorAju: found.doc.ajuNumber, kodeProses: e.code, uraianStatus: e.message, waktuStatus: e.createdAt,
          ...(e.registrationNumber ? { nomorDaftar: e.registrationNumber, tanggalDaftar: e.registrationDate } : {}),
        })),
      };
    },
  };
}
