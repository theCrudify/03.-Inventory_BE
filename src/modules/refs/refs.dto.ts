import { z } from 'zod';
import { pageQuery } from '../../core/http';

export const refType = z.string().trim().min(1).max(30).regex(/^[a-z_]+$/, 'Tipe referensi tidak valid');
export const refListQuery = pageQuery.extend({ pageSize: z.coerce.number().int().min(1).max(500).default(100) });
/** Body of a reference form: code + name + the type's extra fields (sent as `meta`, e.g. BM/PPN/PPh for HS). */
export const refBody = z.object({
  code: z.string().trim().min(1).max(30),
  name: z.string().trim().min(1),
  meta: z.record(z.string(), z.unknown()).nullable().optional(),
  sort: z.number().int().optional(),
});
export type RefBody = z.infer<typeof refBody>;

/** A BC document type with everything the app needs to handle it. Values are master codes. */
export type BcConfig = {
  code: string; label: string; title: string; direction: string; partnerKind: string; ceisaCode: string; slug: string;
  international: boolean; defaultOffice: string; approvalCode: string; approvalMessage: string;
  duty: string; sourceDoc: string; requiresGuarantee: boolean;
};
export type CeisaStage = { code: string; message: string; status: string; afterSec: number };
export type HsTariff = { code: string; bm: number; ppn: number; pph: number };
