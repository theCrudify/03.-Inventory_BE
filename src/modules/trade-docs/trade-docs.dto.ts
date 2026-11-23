import { z } from 'zod';
import { pageQuery } from '../../core/http';

export const tradeDocBody = z.object({
  kind: z.string().trim().min(1), // refs: jenis_sumber
  number: z.string().trim().min(1).max(40),
  date: z.iso.date(),
  partnerId: z.number().int().positive(),
  currency: z.string().trim().toUpperCase(), // refs: valuta
  incoterm: z.string().max(3).nullable().optional(), // refs: incoterm
  lines: z.array(z.object({ itemId: z.number().int().positive(), qty: z.number().positive(), unitPrice: z.number().nonnegative() })).min(1, 'Minimal 1 barang'),
});
export type TradeDocBody = z.infer<typeof tradeDocBody>;
export const tradeDocListQuery = pageQuery.extend({ kind: z.string().optional() });
export type TradeDocListQuery = z.infer<typeof tradeDocListQuery>;
