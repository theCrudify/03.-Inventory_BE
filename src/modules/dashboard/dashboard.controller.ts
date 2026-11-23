import type { Ctx } from '../../core/env';
import { query } from '../../core/http';
import { dashboardQuery } from './dashboard.dto';
import { createDashboardService } from './dashboard.service';

export const dashboardController = {
  summary: async (c: Ctx) => c.json(await createDashboardService(c.get('db')).summary(query(c, dashboardQuery))),
};
