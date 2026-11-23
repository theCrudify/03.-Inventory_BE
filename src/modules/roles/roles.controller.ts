import type { Ctx } from '../../core/env';
import { body } from '../../core/http';
import { roleBody } from './roles.dto';
import { createRolesService } from './roles.service';

const svc = (c: Ctx) => createRolesService(c.get('db'));
const code = (c: Ctx) => c.req.param('code') ?? '';

export const rolesController = {
  list: async (c: Ctx) => c.json(await svc(c).list()),
  create: async (c: Ctx) => c.json(await svc(c).create(c.get('user'), await body(c, roleBody)), 201),
  update: async (c: Ctx) => c.json(await svc(c).update(c.get('user'), code(c), await body(c, roleBody))),
  remove: async (c: Ctx) => { await svc(c).remove(c.get('user'), code(c)); return c.json({ ok: true }); },
};
