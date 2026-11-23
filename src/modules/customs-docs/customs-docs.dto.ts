import { z } from 'zod';
import { pageQuery } from '../../core/http';

const str = z.string().trim().nullish();
const num = z.number().nullish();

/** Transport / packing / attachments of a BC document. Codes refer to master tables; stored as columns and child tables. */
export const headerBody = z.object({
  caraAngkut: str, // transport_modes
  pengangkut: str, nomorVoyage: str, nomorPolisi: str,
  pelabuhanMuat: str, pelabuhanTujuan: str, // ports
  negaraAsal: str, negaraTujuan: str, // countries
  incoterm: str, // incoterms
  tujuanPengiriman: str,
  kemasan: z.object({ jumlah: num, jenis: str }).nullish(), // packagings
  bruto: num, netto: num,
  kontainer: z.array(z.object({ nomor: str, ukuran: str, tipe: str })).default([]), // container_sizes, container_types
  dokumen: z.array(z.object({ jenis: str, nomor: str, tanggal: str })).default([]), // document_types
  jaminan: z.object({ jenis: str, nomor: str, penjamin: str, nilai: num, jatuhTempo: str }).nullish(), // guarantee_types
});
export type HeaderBody = z.infer<typeof headerBody>;

export const customsDocBody = z.object({
  bcType: z.string().trim().min(1), // bc_types
  partnerId: z.number().int().positive(),
  tradeDocId: z.number().int().positive().nullable().optional(),
  officeCode: z.string().trim().min(1), // customs_offices
  currency: z.string().trim().toUpperCase(), // currencies
  kurs: z.number().positive(),
  header: headerBody.default(headerBody.parse({})),
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
  status: z.string().optional(), // document_statuses
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
});
export type CustomsDocListQuery = z.infer<typeof customsDocListQuery>;
