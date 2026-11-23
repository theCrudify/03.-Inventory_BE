import type { Ctx } from '../../core/env';
import { body, idParam, query } from '../../core/http';
import { customsDocBody, customsDocListQuery } from './customs-docs.dto';
import { createCustomsDocsService } from './customs-docs.service';

const svc = (c: Ctx) => createCustomsDocsService(c.get('db'));

export const customsDocsController = {
  list: async (c: Ctx) => c.json(await svc(c).list(query(c, customsDocListQuery))),
  get: async (c: Ctx) => c.json(await svc(c).get(idParam(c))),
  create: async (c: Ctx) => c.json(await svc(c).create(c.get('user'), await body(c, customsDocBody)), 201),
  update: async (c: Ctx) => c.json(await svc(c).update(c.get('user'), idParam(c), await body(c, customsDocBody))),
  remove: async (c: Ctx) => { await svc(c).remove(c.get('user'), idParam(c)); return c.json({ ok: true }); },
  submit: async (c: Ctx) => c.json(await svc(c).submit(c.get('user'), idParam(c))),
};
