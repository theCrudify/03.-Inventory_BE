import { z } from 'zod';
import { pageQuery } from '../../core/http';

export const customsDocBody = z.object({
  bcType: z.string().trim().min(1), // refs: jenis_bc
  partnerId: z.number().int().positive(),
  tradeDocId: z.number().int().positive().nullable().optional(),
  officeCode: z.string().trim().min(1), // refs: kantor
  currency: z.string().trim().toUpperCase(), // refs: valuta
  kurs: z.number().positive(),
  header: z.record(z.string(), z.unknown()).default({}),
  lines: z.array(z.object({
    itemId: z.number().int().positive(),
    hsCode: z.string().nullable().optional(),
    qty: z.number().positive(),
    unitPrice: z.number().nonnegative(),
  })).min(1, 'Minimal 1 barang'),
});
export type CustomsDocBody = z.infer<typeof customsDocBody>;

export const customsDocListQuery = pageQuery.extend({
  bc: z.string().optional(),
  status: z.string().optional(), // refs: status_dokumen
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
});
export type CustomsDocListQuery = z.infer<typeof customsDocListQuery>;
