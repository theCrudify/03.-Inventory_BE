import type { Ctx } from '../../core/env';
import { body, idParam, query } from '../../core/http';
import { tradeDocBody, tradeDocListQuery } from './trade-docs.dto';
import { createTradeDocsService } from './trade-docs.service';

const svc = (c: Ctx) => createTradeDocsService(c.get('db'));

export const tradeDocsController = {
  list: async (c: Ctx) => c.json(await svc(c).list(query(c, tradeDocListQuery))),
  get: async (c: Ctx) => c.json(await svc(c).get(idParam(c))),
  create: async (c: Ctx) => c.json(await svc(c).create(c.get('user'), await body(c, tradeDocBody)), 201),
  update: async (c: Ctx) => c.json(await svc(c).update(c.get('user'), idParam(c), await body(c, tradeDocBody))),
  remove: async (c: Ctx) => { await svc(c).remove(c.get('user'), idParam(c)); return c.json({ ok: true }); },
};
