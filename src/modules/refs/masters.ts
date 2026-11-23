import type { PgTable } from 'drizzle-orm/pg-core';
import * as s from '../../core/db/schema';

// Registry of the code-keyed master tables the reference screens and the UI `/meta` payload expose.
// Each master is a real table; `toMeta`/`fromMeta` translate its columns to the flags/numbers shape the UI
// (and the API contract) has always used, so storage is relational while the JSON contract stays stable.

export type Meta = Record<string, unknown>;
// Rows of heterogeneous tables: columns are addressed by name, validated by the Drizzle schema at the call sites.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Row = Record<string, any>;

export type MasterDef = {
  /** URL segment / legacy reference type used by the UI (`/refs/:type`). */
  type: string;
  /** Human name of the list (tab title). */
  label: string;
  table: PgTable;
  /** Column holding the display name (`name` for most tables, `message` for CEISA stages). */
  nameKey?: string;
  /** Admins may add/change/delete rows. System lists (their flags drive application rules) are read-only. */
  editable: boolean;
  /** Extra editable fields shown in the reference form, besides code and name. */
  fields?: { name: string; label: string }[];
  toMeta?: (row: Row) => Meta | null;
  /** UI meta -> table columns (editable masters only). */
  fromMeta?: (meta: Meta | null | undefined) => Row;
  /** Columns derived from the code when the form does not supply them (e.g. a port's country from its UN/LOCODE prefix). */
  derive?: (code: string) => Row;
  /** Foreign-key columns checked up front so the user gets a readable message instead of a constraint error. */
  checks?: { column: string; master: string; label: string }[];
};

/** Keep only truthy flags; `null` when none. The UI treats a missing flag as false. */
const flags = (o: Record<string, unknown>): Meta | null => {
  const r = Object.fromEntries(Object.entries(o).filter(([, v]) => !!v));
  return Object.keys(r).length ? r : null;
};
const n = (v: unknown, fallback = 0) => (v === undefined || v === null || v === '' ? fallback : Number(v));

export const MASTERS: MasterDef[] = [
  {
    type: 'hs', label: 'HS Code & Tarif', table: s.hsCodes, editable: true,
    fields: [{ name: 'bm', label: 'BM (%)' }, { name: 'ppn', label: 'PPN (%)' }, { name: 'pph', label: 'PPh 22 (%)' }],
    toMeta: (r) => ({ bm: Number(r.bmRate), ppn: Number(r.ppnRate), pph: Number(r.pphRate) }),
    fromMeta: (m) => ({ bmRate: String(n(m?.bm)), ppnRate: String(n(m?.ppn)), pphRate: String(n(m?.pph)) }),
  },
  {
    type: 'valuta', label: 'Valuta & Kurs', table: s.currencies, editable: true,
    fields: [{ name: 'kurs', label: 'Kurs Pajak (Rp)' }],
    toMeta: (r) => ({ kurs: Number(r.rate) }),
    fromMeta: (m) => ({ rate: String(n(m?.kurs, 1)) }),
  },
  { type: 'negara', label: 'Negara', table: s.countries, editable: true },
  {
    type: 'pelabuhan', label: 'Pelabuhan', table: s.ports, editable: true,
    // UN/LOCODE: the first two letters of a port code are its ISO country code.
    derive: (code) => ({ countryCode: code.slice(0, 2).toUpperCase() }),
    checks: [{ column: 'countryCode', master: 'negara', label: 'Negara pelabuhan' }],
  },
  { type: 'kantor', label: 'Kantor Pabean', table: s.customsOffices, editable: true },
  { type: 'satuan', label: 'Satuan', table: s.units, editable: true },
  { type: 'kemasan', label: 'Kemasan', table: s.packagings, editable: true },
  { type: 'incoterm', label: 'Incoterm', table: s.incoterms, editable: true },
  { type: 'jenis_dokumen', label: 'Jenis Dokumen Pelengkap', table: s.documentTypes, editable: true },
  {
    type: 'cara_angkut', label: 'Cara Angkut', table: s.transportModes, editable: true,
    toMeta: (r) => flags({ usesPort: r.usesPort, usesContainer: r.usesContainer, usesPlate: r.usesPlate }),
    fromMeta: (m) => ({ usesPort: !!m?.usesPort, usesContainer: !!m?.usesContainer, usesPlate: !!m?.usesPlate }),
  },
  { type: 'ukuran_kontainer', label: 'Ukuran Kontainer', table: s.containerSizes, editable: true },
  { type: 'tipe_kontainer', label: 'Tipe Kontainer', table: s.containerTypes, editable: true },
  { type: 'jenis_jaminan', label: 'Jenis Jaminan', table: s.guaranteeTypes, editable: true },

  // ── system masters: their columns drive application rules, so they are read-only in the UI ──
  {
    type: 'kategori_barang', label: 'Kategori Barang', table: s.itemCategories, editable: false,
    toMeta: (r) => ({ report: r.reportTitle, slug: r.slug }),
  },
  { type: 'jenis_mitra', label: 'Jenis Mitra', table: s.partnerKinds, editable: false },
  {
    type: 'jenis_bc', label: 'Jenis Dokumen BC', table: s.bcTypes, editable: false,
    toMeta: (r) => ({
      title: r.title, direction: r.directionCode, partnerKind: r.partnerKindCode, ceisaCode: r.ceisaCode, slug: r.slug,
      ...flags({ international: r.international }), defaultOffice: r.defaultOfficeCode,
      approvalCode: r.approvalCode, approvalMessage: r.approvalMessage, duty: r.dutyTreatmentCode, sourceDoc: r.sourceDocCode,
      ...flags({ requiresGuarantee: r.requiresGuarantee }),
    }),
  },
  {
    type: 'jenis_sumber', label: 'Jenis Sumber Dokumen', table: s.sourceDocTypes, editable: false,
    toMeta: (r) => ({
      slug: r.slug, partnerKind: r.partnerKindCode, ...(r.documentTypeCode ? { documentType: r.documentTypeCode } : {}), description: r.description,
    }),
  },
  {
    type: 'arah_dokumen', label: 'Arah Dokumen', table: s.directions, editable: false,
    toMeta: (r) => ({
      sign: r.sign, partyLabel: r.partyLabel, shortLabel: r.shortLabel, tone: r.tone,
      countryField: r.countryIsOrigin ? 'negaraAsal' : 'negaraTujuan', countryLabel: r.countryLabel,
    }),
  },
  {
    type: 'perlakuan_pungutan', label: 'Perlakuan Pungutan', table: s.dutyTreatments, editable: false,
    toMeta: (r) => ({ charged: !!r.charged }),
  },
  {
    type: 'sumber_mutasi', label: 'Sumber Mutasi Stok', table: s.stockSources, editable: false,
    toMeta: (r) => flags({ fromDocument: r.fromDocument, adjustment: r.isAdjustment }),
  },
  {
    type: 'tahap_ceisa', label: 'Tahap Respon CEISA', table: s.ceisaStages, nameKey: 'message', editable: false,
    toMeta: (r) => ({ status: r.statusCode, afterSec: r.afterSec }),
  },
];

export const MASTER_BY_TYPE = new Map(MASTERS.map((m) => [m.type, m]));

/** The registry exposed to the UI as the `tipe_referensi` list: which lists exist, whether they are editable, their extra fields. */
export const REGISTRY_TYPE = 'tipe_referensi';
export const registryRows = () => MASTERS.map((m, i) => ({
  id: m.type, type: REGISTRY_TYPE, code: m.type, name: m.label, sort: i,
  meta: { editable: m.editable, ...(m.fields ? { fields: m.fields } : {}) } as Meta,
}));
