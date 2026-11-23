import type { Ctx } from '../../core/env';
import { body, idParam, query } from '../../core/http';
import { partnerBody, partnerListQuery } from './partners.dto';
import { createPartnersService } from './partners.service';

const svc = (c: Ctx) => createPartnersService(c.get('db'));

export const partnersController = {
  list: async (c: Ctx) => c.json(await svc(c).list(query(c, partnerListQuery))),
  create: async (c: Ctx) => c.json(await svc(c).create(c.get('user'), await body(c, partnerBody)), 201),
  update: async (c: Ctx) => c.json(await svc(c).update(c.get('user'), idParam(c), await body(c, partnerBody))),
  remove: async (c: Ctx) => { await svc(c).remove(c.get('user'), idParam(c)); return c.json({ ok: true }); },
};
