import type { Ctx } from '../../core/env';
import { body, idParam, query } from '../../core/http';
import { createUserBody, updateUserBody, userListQuery } from './users.dto';
import { createUsersService } from './users.service';

const svc = (c: Ctx) => createUsersService(c.get('db'));

export const usersController = {
  list: async (c: Ctx) => c.json(await svc(c).list(query(c, userListQuery))),
  create: async (c: Ctx) => c.json(await svc(c).create(c.get('user'), await body(c, createUserBody)), 201),
  update: async (c: Ctx) => c.json(await svc(c).update(c.get('user'), idParam(c), await body(c, updateUserBody))),
  remove: async (c: Ctx) => { await svc(c).remove(c.get('user'), idParam(c)); return c.json({ ok: true }); },
};
