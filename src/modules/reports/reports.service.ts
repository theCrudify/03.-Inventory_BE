import type { Db } from '../../core/db/client';
import { createCustomsDocsService } from '../customs-docs/customs-docs.service';
import { createRefsService } from '../refs/refs.service';
import type { MutasiQuery } from './reports.dto';
import { createReportsRepository } from './reports.repository';

const SORTABLE = ['code', 'name', 'uom', 'saldoAwal', 'pemasukan', 'pengeluaran', 'penyesuaian', 'saldoAkhir'] as const;
type SortKey = (typeof SORTABLE)[number];

export function createReportsService(db: Db) {
  const repo = createReportsRepository(db);
  const refs = createRefsService(db);
  return {
    async mutasi(q: MutasiQuery) {
      await refs.assertCode('kategori_barang', q.category, 'Kategori');
      await createCustomsDocsService(db).advanceInFlight();
      const raw = await repo.mutasi(q, await refs.movementSources('adjustment'));
      const rows = raw.map((r) => ({ ...r, saldoAkhir: r.saldoAwal + r.pemasukan - r.pengeluaran + r.penyesuaian }));
      const key = SORTABLE.includes(q.sortBy as SortKey) ? (q.sortBy as SortKey) : 'code';
      const dir = q.sortDir === 'desc' ? -1 : 1;
      rows.sort((a, b) => {
        const av = a[key], bv = b[key];
        const cmp = typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av ?? '').localeCompare(String(bv ?? ''));
        return cmp !== 0 ? cmp * dir : a.code.localeCompare(b.code);
      });
      if (q.page !== undefined) {
        const start = (q.page - 1) * q.pageSize;
        return { data: rows.slice(start, start + q.pageSize), total: rows.length, page: q.page, pageSize: q.pageSize };
      }
      return rows;
    },
  };
}
