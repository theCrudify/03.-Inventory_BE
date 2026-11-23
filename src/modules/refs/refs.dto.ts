import { z } from 'zod';
import { pageQuery } from '../../core/http';

export const refType = z.string().trim().min(1).max(30).regex(/^[a-z_]+$/, 'Tipe referensi tidak valid');
export const refListQuery = pageQuery.extend({ pageSize: z.coerce.number().int().min(1).max(500).default(100) });
export const refBody = z.object({
  code: z.string().trim().min(1).max(30),
  name: z.string().trim().min(1),
  meta: z.record(z.string(), z.unknown()).nullable().optional(),
  sort: z.number().int().optional(),
});
export type RefBody = z.infer<typeof refBody>;

// Shapes of `meta` per reference type. Codes are plain strings: whatever exists in `refs` is valid.
const flag = z.boolean().default(false);

/** `tipe_referensi`: which lists admins may edit and their extra fields. */
export const refTypeMeta = z.object({
  editable: flag,
  fields: z.array(z.object({ name: z.string(), label: z.string(), type: z.string().default('number') })).default([]),
});

/** `jenis_bc`: everything the app needs to know about a BC document type (values are other ref codes). */
export const bcTypeMeta = z.object({
  title: z.string(),
  direction: z.string(), // refs: arah_dokumen
  partnerKind: z.string(), // refs: jenis_mitra
  ceisaCode: z.string(),
  slug: z.string(),
  international: flag,
  defaultOffice: z.string(), // refs: kantor
  approvalCode: z.string(),
  approvalMessage: z.string(),
  duty: z.string(), // refs: perlakuan_pungutan
  sourceDoc: z.string(), // refs: jenis_sumber
  requiresGuarantee: flag,
});
export type BcConfig = z.infer<typeof bcTypeMeta> & { code: string; label: string };

/** `status_dokumen`: the document lifecycle is defined by these flags, not by status names. */
export const statusMeta = z.object({
  tone: z.string().default('gray'),
  initial: flag, // status of a new / edited document
  editable: flag, // may be edited, deleted, (re)submitted
  inFlight: flag, // waiting for CEISA
  registered: flag, // registration number has been issued
  approved: flag, // final approval: stock is booked
  rejected: flag, // final rejection
});
export type DocStatus = z.infer<typeof statusMeta> & { code: string; label: string };

/** `tahap_ceisa`: status reached and seconds after submission. */
export const ceisaStageMeta = z.object({ status: z.string(), afterSec: z.number().min(0) });
export type CeisaStage = z.infer<typeof ceisaStageMeta> & { code: string; message: string };

/** `role`: permissions are data. */
export const roleMeta = z.object({ tone: z.string().default('gray'), description: z.string().default(''), canWrite: flag, isAdmin: flag });

/** `arah_dokumen`: stock sign and wording per direction. */
export const directionMeta = z.object({ sign: z.number().refine((n) => n === 1 || n === -1, 'sign harus 1 atau -1'), partyLabel: z.string(), shortLabel: z.string(), tone: z.string().default('gray'), countryField: z.string(), countryLabel: z.string() });

/** `perlakuan_pungutan`: whether duties are computed. */
export const dutyMeta = z.object({ charged: flag });

/** `sumber_mutasi`: which source the document flow writes, which counts as stock adjustment. */
export const movementSourceMeta = z.object({ fromDocument: flag, adjustment: flag });

export const hsTariffMeta = z.object({ bm: z.number(), ppn: z.number(), pph: z.number() });
export type HsTariff = z.infer<typeof hsTariffMeta>;
