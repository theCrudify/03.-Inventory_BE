import { z } from 'zod';

export const mutasiQuery = z.object({
  category: z.string().min(1), // refs: kategori_barang
  from: z.iso.date(),
  to: z.iso.date(),
  q: z.string().trim().optional(),
  sortBy: z.string().trim().optional(),
  sortDir: z.enum(['asc', 'desc']).default('asc'),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(200).default(20),
}).refine((q) => q.from <= q.to, { message: 'Tanggal awal harus sebelum tanggal akhir', path: ['from'] });
export type MutasiQuery = z.infer<typeof mutasiQuery>;
