import { z } from 'zod';

export const mutasiQuery = z.object({
  category: z.string().min(1), // refs: kategori_barang
  from: z.iso.date(),
  to: z.iso.date(),
}).refine((q) => q.from <= q.to, { message: 'Tanggal awal harus sebelum tanggal akhir', path: ['from'] });
export type MutasiQuery = z.infer<typeof mutasiQuery>;
