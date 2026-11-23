import type { Ctx } from '../../core/env';
import { settingKey, type SettingKey } from './settings.dto';
import { createSettingsService } from './settings.service';

const svc = (c: Ctx) => createSettingsService(c.get('db'));

export const settingsController = {
  publicMeta: async (c: Ctx) => c.json(await svc(c).publicMeta()),
  meta: async (c: Ctx) => c.json(await svc(c).meta()),
  update: async (c: Ctx) => c.json(await svc(c).update(c.get('user'), settingKey.parse(c.req.param('key')) as SettingKey, await c.req.json())),
};
