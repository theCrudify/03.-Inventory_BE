import { z } from 'zod';
import { pageQuery } from '../../core/http';

export const itemBody = z.object({
  code: z.string().trim().min(1).max(40),
  name: z.string().trim().min(1),
  category: z.string().trim().min(1), // refs: kategori_barang
  hsCode: z.string().trim().regex(/^\d{4}\.?\d{2}\.?\d{2}$/, 'HS code 8 digit, contoh 5607.50.90').nullable().optional(),
  uom: z.string().trim().min(1).max(10), // refs: satuan
});
export type ItemBody = z.infer<typeof itemBody>;
export const itemListQuery = pageQuery.extend({ category: z.string().optional() });
export type ItemListQuery = z.infer<typeof itemListQuery>;
