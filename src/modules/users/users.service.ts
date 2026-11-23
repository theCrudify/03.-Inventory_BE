import type { Db } from '../../core/db/client';
import type { AuthUser } from '../../core/env';
import { badRequest, notFound } from '../../core/errors';
import { hashPassword } from '../../core/password';
import { createAuditService } from '../audit/audit.service';
import { createRefsService } from '../refs/refs.service';
import type { CreateUserBody, UpdateUserBody } from './users.dto';
import { createUsersRepository } from './users.repository';

export function createUsersService(db: Db) {
  const repo = createUsersRepository(db);
  const audit = createAuditService(db);
  const refs = createRefsService(db);
  return {
    list: repo.list,
    async create(actor: AuthUser, { password, ...b }: CreateUserBody) {
      await refs.role(b.role);
      const row = await repo.insert({ ...b, passwordHash: await hashPassword(password) });
      await audit.log(actor, { action: 'create', entity: 'user', entityId: row.id, data: { email: row.email } });
      return row;
    },
    async update(actor: AuthUser, id: number, { password, ...b }: UpdateUserBody) {
      const perms = await refs.role(b.role);
      if (id === actor.id && !perms.isAdmin) throw badRequest('Tidak dapat melepas hak admin dari akun sendiri');
      const row = await repo.update(id, { ...b, ...(password && { passwordHash: await hashPassword(password) }) });
      if (!row) throw notFound('User');
      await audit.log(actor, { action: 'update', entity: 'user', entityId: id });
      return row;
    },
    async remove(actor: AuthUser, id: number) {
      if (id === actor.id) throw badRequest('Tidak dapat menghapus akun sendiri');
      const row = await repo.remove(id);
      if (!row) throw notFound('User');
      await audit.log(actor, { action: 'delete', entity: 'user', entityId: id, data: { email: row.email } });
    },
  };
}
