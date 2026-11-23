import type { Ctx } from '../../core/env';
import { body, idParam, query } from '../../core/http';
import { refBody, refListQuery, refType } from './refs.dto';
import { createRefsService } from './refs.service';

const svc = (c: Ctx) => createRefsService(c.get('db'));
const type = (c: Ctx) => refType.parse(c.req.param('type'));

export const refsController = {
  list: async (c: Ctx) => c.json(await svc(c).list(type(c), query(c, refListQuery))),
  create: async (c: Ctx) => c.json(await svc(c).create(c.get('user'), type(c), await body(c, refBody)), 201),
  update: async (c: Ctx) => c.json(await svc(c).update(c.get('user'), type(c), idParam(c), await body(c, refBody))),
  remove: async (c: Ctx) => { await svc(c).remove(c.get('user'), type(c), idParam(c)); return c.json({ ok: true }); },
  insw: async (c: Ctx) => c.json(await svc(c).insw(c.req.param('code') ?? '')),
};
