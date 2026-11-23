import type { Db } from '../../core/db/client';
import type { AuthUser } from '../../core/env';
import { badRequest, notFound } from '../../core/errors';
import { createAuditService } from '../audit/audit.service';
import type { RoleBody } from './roles.dto';
import { createRolesRepository } from './roles.repository';

export function createRolesService(db: Db) {
  const repo = createRolesRepository(db);
  const audit = createAuditService(db);

  /** There must always be at least one role able to administer the system, whatever `change` does to `code`. */
  async function assertAdminRemains(change: { code: string; isAdmin?: boolean; removed?: boolean }) {
    const admins = (await repo.list()).filter((r) => {
      if (r.code !== change.code) return r.isAdmin;
      if (change.removed) return false;
      return change.isAdmin ?? r.isAdmin;
    });
    if (!admins.length) throw badRequest('Minimal harus ada satu role dengan hak admin');
  }

  return {
    list: repo.list,
    /** Permissions of a role, or 400 when the code is not in the master. */
    async get(code: string) {
      const r = await repo.find(code);
      if (!r) throw badRequest(`Role "${code}" tidak terdaftar`);
      return r;
    },
    async create(actor: AuthUser, b: RoleBody) {
      const row = await repo.insert(b);
      await audit.log(actor, { action: 'create', entity: 'role', data: { code: row.code } });
      return row;
    },
    async update(actor: AuthUser, code: string, b: RoleBody) {
      if (b.code !== code) throw badRequest('Kode role tidak dapat diubah');
      if (!(await repo.find(code))) throw notFound('Role');
      await assertAdminRemains({ code, isAdmin: b.isAdmin });
      const row = await repo.update(code, b);
      await audit.log(actor, { action: 'update', entity: 'role', data: { code } });
      return row;
    },
    /** Fails with 409 (foreign key) while any user still has the role. */
    async remove(actor: AuthUser, code: string) {
      if (!(await repo.find(code))) throw notFound('Role');
      await assertAdminRemains({ code, removed: true });
      await repo.remove(code);
      await audit.log(actor, { action: 'delete', entity: 'role', data: { code } });
    },
  };
}
export type RolesService = ReturnType<typeof createRolesService>;
