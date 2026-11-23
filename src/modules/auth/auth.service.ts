import { sign } from 'hono/jwt';
import type { z } from 'zod';
import type { Db } from '../../core/db/client';
import type { AuthUser } from '../../core/env';
import { badRequest, httpError, RateLimitError } from '../../core/errors';
import { hashPassword, verifyPassword } from '../../core/password';
import { APP_AUDIENCE, signingSecret } from '../../core/security';
import { createAuditService } from '../audit/audit.service';
import { createSettingsRepository } from '../settings/settings.repository';
import { LOGIN_RULES, TOKEN_TTL_SEC, type changePasswordBody, type loginBody } from './auth.dto';
import { createAuthRepository } from './auth.repository';

// Verified against when the email is unknown, so "no such user" costs the same time as "wrong password".
const DECOY_HASH = 'pbkdf2$100000$488ac0b4b4297f144eaf0bbe4b4b311a$16d293f306231b8743cda1a5079b837fb62442b2d7e47b8346db5993b464be2c';
const BAD_LOGIN = 'Email atau password salah';

export function createAuthService(db: Db, jwtSecret: string) {
  const repo = createAuthRepository(db);
  const audit = createAuditService(db);

  return {
    async login({ ip }: { ip: string }, { email, password }: z.infer<typeof loginBody>) {
      const clientKey = `ip:${ip}|email:${email}`, emailKey = `email:${email}`;
      const wait = await repo.lockedFor([clientKey, emailKey]);
      if (wait > 0) throw new RateLimitError(`Terlalu banyak percobaan login. Coba lagi dalam ${Math.ceil(wait / 60)} menit.`, wait);

      const u = await repo.byEmail(email);
      const ok = u ? await verifyPassword(password, u.passwordHash) : (await verifyPassword(password, DECOY_HASH), false);
      if (!u || !ok) {
        await Promise.all([repo.recordFailure(clientKey, LOGIN_RULES.perClient), repo.recordFailure(emailKey, LOGIN_RULES.perEmail), repo.purgeOldAttempts()]);
        await audit.log(null, { action: 'login_failed', entity: 'user', data: { email } });
        throw httpError(401, BAD_LOGIN);
      }

      const s = await repo.session(u.id);
      if (!s) throw httpError(401, BAD_LOGIN); // role vanished: treat as no access
      await repo.clearAttempts([clientKey, emailKey]);
      const now = Math.floor(Date.now() / 1000);
      // Identity only: permissions are read from the database on every request, never carried in the token.
      const token = await sign({ sub: String(u.id), tv: u.tokenVersion, aud: APP_AUDIENCE, iat: now, exp: now + TOKEN_TTL_SEC }, signingSecret(jwtSecret, APP_AUDIENCE));
      const user: AuthUser = { id: s.id, name: s.name, email: s.email, role: s.role, canWrite: s.canWrite, isAdmin: s.isAdmin };
      await audit.log(user, { action: 'login', entity: 'user', entityId: u.id });
      return { token, user };
    },

    async changePassword(actor: AuthUser, b: z.infer<typeof changePasswordBody>) {
      if (await createSettingsRepository(db).isDemoUser(actor.id)) throw httpError(403, 'Akun demo tidak dapat diubah');
      const u = await repo.byId(actor.id);
      if (!u || !(await verifyPassword(b.currentPassword, u.passwordHash))) throw badRequest('Password saat ini salah');
      if (b.newPassword === b.currentPassword) throw badRequest('Password baru harus berbeda dari password saat ini');
      await repo.setPassword(u.id, await hashPassword(b.newPassword));
      await audit.log(actor, { action: 'change_password', entity: 'user', entityId: u.id });
    },
  };
}
