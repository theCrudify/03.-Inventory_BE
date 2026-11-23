import type { Db } from '../../core/db/client';
import { createCustomsDocsService } from '../customs-docs/customs-docs.service';
import { createRefsService } from '../refs/refs.service';
import { createSettingsService } from '../settings/settings.service';
import type { DashboardQuery } from './dashboard.dto';
import { createDashboardRepository } from './dashboard.repository';

export function createDashboardService(db: Db) {
  const repo = createDashboardRepository(db);
  const customs = createCustomsDocsService(db);
  const refs = createRefsService(db);
  const settings = createSettingsService(db);

  return {
    /** Counts keyed by status code and trend keyed by direction code; the UI labels them from master data. */
    async summary(q: DashboardQuery) {
      await customs.advanceInFlight();
      const [{ timezone }, life, bcTypes] = await Promise.all([settings.company(), refs.lifecycle(), refs.bcConfigs()]);
      const [counts, monthly, recentEvents, master] = await Promise.all([
        repo.countsByTypeStatus(), repo.approvedValueByMonth(life.approved, q.months, timezone), repo.recentEvents(q.recent), repo.masterCounts(),
      ]);
      const direction = new Map(bcTypes.map((b) => [b.code, b.direction]));

      const byStatus: Record<string, number> = {};
      for (const r of counts) byStatus[r.status] = (byStatus[r.status] ?? 0) + r.n;

      const months = [...Array(q.months)].map((_, i) => {
        const d = new Date(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - (q.months - 1) + i);
        return d.toISOString().slice(0, 7);
      });
      const trend = months.map((month) => {
        const values: Record<string, number> = {};
        for (const r of monthly.filter((x) => x.month === month)) {
          const dir = direction.get(r.bcType);
          if (dir) values[dir] = Math.round((values[dir] ?? 0) + r.idr);
        }
        return { month, values };
      });

      return {
        byStatus,
        totals: { dokumen: counts.reduce((a, r) => a + r.n, 0), barang: master.items, mitra: master.partners },
        perJenis: bcTypes.map((b) => ({ bcType: b.code, total: counts.filter((r) => r.bcType === b.code).reduce((a, r) => a + r.n, 0) })),
        trend,
        recentEvents,
      };
    },
  };
}
