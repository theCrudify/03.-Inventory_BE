import type { Db } from '../../core/db/client';
import { createCustomsDocsService } from '../customs-docs/customs-docs.service';
import { createRefsService } from '../refs/refs.service';
import type { MutasiQuery } from './reports.dto';
import { createReportsRepository } from './reports.repository';

export function createReportsService(db: Db) {
  const repo = createReportsRepository(db);
  const refs = createRefsService(db);
  return {
    async mutasi(q: MutasiQuery) {
      await refs.assertCode('kategori_barang', q.category, 'Kategori');
      await createCustomsDocsService(db).advanceInFlight();
      const rows = await repo.mutasi(q, await refs.movementSources('adjustment'));
      return rows.map((r) => ({ ...r, saldoAkhir: r.saldoAwal + r.pemasukan - r.pengeluaran + r.penyesuaian }));
    },
  };
}
