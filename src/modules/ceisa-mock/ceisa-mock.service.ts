import { sign, verify } from 'hono/jwt';
import type { z } from 'zod';
import type { Db } from '../../core/db/client';
import { createCustomsDocsService } from '../customs-docs/customs-docs.service';
import { CEISA_TOKEN_SCOPE, CEISA_TOKEN_TTL_SEC, type ceisaLoginBody } from './ceisa-mock.dto';

/** Mock of the CEISA 4.0 host-to-host gateway (same paths and response shape as the real one). */
export function createCeisaMockService(db: Db, secret: string) {
  const customs = createCustomsDocsService(db);
  return {
    async login(b: z.infer<typeof ceisaLoginBody>) {
      const access_token = await sign({ sub: b.username, scope: CEISA_TOKEN_SCOPE, exp: Math.floor(Date.now() / 1000) + CEISA_TOKEN_TTL_SEC }, secret);
      return { status: 'success', message: 'Login berhasil', item: { access_token, refresh_token: crypto.randomUUID(), expires_in: CEISA_TOKEN_TTL_SEC, token_type: 'Bearer' } };
    },
    async verifyToken(token: string) {
      const p = await verify(token, secret, 'HS256');
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
          ...(e.payload?.nomorDaftar ? { nomorDaftar: e.payload.nomorDaftar, tanggalDaftar: e.payload.tanggalDaftar } : {}),
        })),
      };
    },
  };
}
