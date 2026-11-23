import { sign } from 'hono/jwt';
import type { z } from 'zod';
import type { Db } from '../../core/db/client';
import type { AuthUser } from '../../core/env';
import { badRequest, httpError } from '../../core/errors';
import { hashPassword, verifyPassword } from '../../core/password';
import { createAuditService } from '../audit/audit.service';
import { createRolesService } from '../roles/roles.service';
import { TOKEN_TTL_SEC, type changePasswordBody, type loginBody } from './auth.dto';
import { createAuthRepository } from './auth.repository';

export function createAuthService(db: Db, jwtSecret: string) {
  const repo = createAuthRepository(db);
  const audit = createAuditService(db);
  return {
    async login({ email, password }: z.infer<typeof loginBody>) {
      const u = await repo.byEmail(email);
      if (!u || !(await verifyPassword(password, u.passwordHash))) throw httpError(401, 'Email atau password salah');
      const perms = await createRolesService(db).get(u.role);
      const user: AuthUser = { id: u.id, name: u.name, email: u.email, role: u.role, canWrite: perms.canWrite, isAdmin: perms.isAdmin };
      const token = await sign({ user, exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_SEC }, jwtSecret);
      await audit.log(user, { action: 'login', entity: 'user', entityId: u.id });
      return { token, user };
    },
    async changePassword(actor: AuthUser, b: z.infer<typeof changePasswordBody>) {
      const u = await repo.byId(actor.id);
      if (!u || !(await verifyPassword(b.currentPassword, u.passwordHash))) throw badRequest('Password saat ini salah');
      await repo.setPassword(u.id, await hashPassword(b.newPassword));
      await audit.log(actor, { action: 'change_password', entity: 'user', entityId: u.id });
    },
  };
}
