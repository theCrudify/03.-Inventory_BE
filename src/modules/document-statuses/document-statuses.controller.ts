import type { Ctx } from '../../core/env';
import { body } from '../../core/http';
import { statusBody } from './document-statuses.dto';
import { createDocumentStatusesService } from './document-statuses.service';

const svc = (c: Ctx) => createDocumentStatusesService(c.get('db'));
const code = (c: Ctx) => c.req.param('code') ?? '';

export const documentStatusesController = {
  list: async (c: Ctx) => c.json(await svc(c).list()),
  create: async (c: Ctx) => c.json(await svc(c).create(c.get('user'), await body(c, statusBody)), 201),
  update: async (c: Ctx) => c.json(await svc(c).update(c.get('user'), code(c), await body(c, statusBody))),
  remove: async (c: Ctx) => { await svc(c).remove(c.get('user'), code(c)); return c.json({ ok: true }); },
};
