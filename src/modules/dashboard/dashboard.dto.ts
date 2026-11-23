import { z } from 'zod';

export const dashboardQuery = z.object({
  months: z.coerce.number().int().min(1).max(24).default(6),
  recent: z.coerce.number().int().min(1).max(50).default(8),
});
export type DashboardQuery = z.infer<typeof dashboardQuery>;
