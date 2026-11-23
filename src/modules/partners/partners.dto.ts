import { z } from 'zod';
import { pageQuery } from '../../core/http';

export const partnerBody = z.object({
  kind: z.string().trim().min(1), // refs: jenis_mitra
  name: z.string().trim().min(1),
  npwp: z.string().trim().regex(/^\d{15,16}$|^\d{2}\.\d{3}\.\d{3}\.\d-\d{3}\.\d{3}$/, 'NPWP 15/16 digit').nullable().optional(),
  address: z.string().trim().nullable().optional(),
  countryCode: z.string().trim().toUpperCase(), // refs: negara
});
export type PartnerBody = z.infer<typeof partnerBody>;
export const partnerListQuery = pageQuery.extend({ kind: z.string().optional() });
export type PartnerListQuery = z.infer<typeof partnerListQuery>;
