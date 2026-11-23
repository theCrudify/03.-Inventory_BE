import type { Ctx } from '../../core/env';
import { body, idParam, query } from '../../core/http';
import { itemBody, itemListQuery } from './items.dto';
import { createItemsService } from './items.service';

const svc = (c: Ctx) => createItemsService(c.get('db'));

export const itemsController = {
  list: async (c: Ctx) => c.json(await svc(c).list(query(c, itemListQuery))),
  create: async (c: Ctx) => c.json(await svc(c).create(c.get('user'), await body(c, itemBody)), 201),
  update: async (c: Ctx) => c.json(await svc(c).update(c.get('user'), idParam(c), await body(c, itemBody))),
  remove: async (c: Ctx) => { await svc(c).remove(c.get('user'), idParam(c)); return c.json({ ok: true }); },
};
