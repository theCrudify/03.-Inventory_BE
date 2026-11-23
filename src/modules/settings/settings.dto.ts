import { z } from 'zod';


export const companySettings = z.object({
  name: z.string().min(1),
  npwp: z.string().min(1),
  izinKb: z.string().min(1),
  companyId: z.string().regex(/^\d{1,6}$/, 'ID perusahaan CEISA maksimal 6 digit'),
  address: z.string().min(1),
  city: z.string().min(1),
  timezone: z.string().min(1), // IANA, e.g. Asia/Jakarta: business dates (aju, registration, stock)
  signatory: z.object({ name: z.string().min(1), title: z.string().min(1) }),
});
export type CompanySettings = z.infer<typeof companySettings>;

export const appSettings = z.object({
  name: z.string().min(1),
  subtitle: z.string(),
  tagline: z.string(),
  description: z.string(),
  features: z.array(z.string()).default([]),
  environmentLabel: z.string().nullable().default(null),
  footnote: z.string().nullable().default(null),
  printHeader: z.string().default(''),
  printFootnote: z.string().nullable().default(null),
  demo: z.object({ password: z.string(), accounts: z.array(z.object({ email: z.string(), label: z.string(), description: z.string() })) }).nullable().default(null),
});

export const settingSchemas = { company: companySettings, app: appSettings } as const;
export type SettingKey = keyof typeof settingSchemas;
export const settingKey = z.string().refine((k): k is SettingKey => k in settingSchemas, 'Pengaturan tidak dikenal');
/** Reference types sent to the UI in /meta (small lists only; big lists are paged). */
export const META_REF_TYPES = [
  'tipe_referensi', 'jenis_bc', 'jenis_sumber', 'arah_dokumen', 'perlakuan_pungutan', 'sumber_mutasi', 'status_dokumen', 'tahap_ceisa', 'kategori_barang', 'jenis_mitra', 'role',
  'kantor', 'valuta', 'negara', 'pelabuhan', 'satuan', 'kemasan', 'incoterm', 'hs',
  'jenis_dokumen', 'cara_angkut', 'ukuran_kontainer', 'tipe_kontainer', 'jenis_jaminan',
];
