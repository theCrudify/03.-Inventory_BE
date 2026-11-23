import type { Ctx } from '../../core/env';
import { query } from '../../core/http';
import { mutasiQuery } from './reports.dto';
import { createReportsService } from './reports.service';

export const reportsController = {
  mutasi: async (c: Ctx) => c.json(await createReportsService(c.get('db')).mutasi(query(c, mutasiQuery))),
};
