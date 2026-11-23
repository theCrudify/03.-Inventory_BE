// Pure mapping between the API's `header` object (the contract clients have always used) and the relational
// storage: scalar columns on `customs_docs` plus the child tables containers / supporting documents / guarantee.
import type { customsDocContainers, customsDocDocuments, customsDocEvents, customsDocGuarantees, customsDocs } from '../../core/db/schema';
import type { HeaderBody } from './customs-docs.dto';

type DocRow = typeof customsDocs.$inferSelect;
type DocColumns = Pick<typeof customsDocs.$inferInsert,
  | 'transportModeCode' | 'carrierName' | 'voyageNumber' | 'vehiclePlate' | 'loadingPortCode' | 'destinationPortCode'
  | 'originCountryCode' | 'destinationCountryCode' | 'incotermCode' | 'shippingPurpose'
  | 'packageCount' | 'packageTypeCode' | 'grossWeight' | 'netWeight'>;
export type ContainerInsert = Omit<typeof customsDocContainers.$inferInsert, 'docId'>;
export type DocumentInsert = Omit<typeof customsDocDocuments.$inferInsert, 'docId'>;
export type GuaranteeInsert = Omit<typeof customsDocGuarantees.$inferInsert, 'docId'>;
export type HeaderParts = { columns: DocColumns; containers: ContainerInsert[]; documents: DocumentInsert[]; guarantee: GuaranteeInsert | null };

/** Empty strings from forms mean "not provided". */
const text = (v: string | null | undefined) => (v && v.trim() ? v.trim() : null);
const decimal = (v: number | null | undefined) => (v === null || v === undefined || Number.isNaN(v) ? null : String(v));

export function headerToParts(h: HeaderBody): HeaderParts {
  const g = h.jaminan;
  const hasGuarantee = !!g && [g.jenis, g.nomor, g.penjamin, g.nilai, g.jatuhTempo].some((v) => v !== null && v !== undefined && v !== '');
  return {
    columns: {
      transportModeCode: text(h.caraAngkut), carrierName: text(h.pengangkut), voyageNumber: text(h.nomorVoyage), vehiclePlate: text(h.nomorPolisi),
      loadingPortCode: text(h.pelabuhanMuat), destinationPortCode: text(h.pelabuhanTujuan),
      originCountryCode: text(h.negaraAsal), destinationCountryCode: text(h.negaraTujuan),
      incotermCode: text(h.incoterm), shippingPurpose: text(h.tujuanPengiriman),
      packageCount: h.kemasan?.jumlah ?? null, packageTypeCode: text(h.kemasan?.jenis),
      grossWeight: decimal(h.bruto), netWeight: decimal(h.netto),
    },
    containers: (h.kontainer ?? []).filter((k) => text(k.nomor)).map((k) => ({ containerNumber: k.nomor!.trim(), sizeCode: k.ukuran!, typeCode: k.tipe! })),
    documents: (h.dokumen ?? []).filter((d) => text(d.nomor)).map((d) => ({ documentTypeCode: d.jenis!, number: d.nomor!.trim(), documentDate: text(d.tanggal) })),
    guarantee: hasGuarantee
      ? { guaranteeTypeCode: text(g!.jenis), number: text(g!.nomor), guarantor: text(g!.penjamin), amount: decimal(g!.nilai), dueDate: text(g!.jatuhTempo) }
      : null,
  };
}

/** Rebuild the `header` object clients expect; fields without a value are omitted, as before. */
export function partsToHeader(
  d: DocRow,
  containers: (typeof customsDocContainers.$inferSelect)[],
  documents: (typeof customsDocDocuments.$inferSelect)[],
  guarantee: typeof customsDocGuarantees.$inferSelect | undefined,
) {
  const h: Record<string, unknown> = {};
  const put = (k: string, v: unknown) => { if (v !== null && v !== undefined && v !== '') h[k] = v; };
  put('caraAngkut', d.transportModeCode); put('pengangkut', d.carrierName); put('nomorVoyage', d.voyageNumber); put('nomorPolisi', d.vehiclePlate);
  put('pelabuhanMuat', d.loadingPortCode); put('pelabuhanTujuan', d.destinationPortCode);
  put('negaraAsal', d.originCountryCode); put('negaraTujuan', d.destinationCountryCode);
  put('incoterm', d.incotermCode); put('tujuanPengiriman', d.shippingPurpose);
  if (d.packageCount !== null || d.packageTypeCode) h.kemasan = { ...(d.packageCount !== null ? { jumlah: d.packageCount } : {}), ...(d.packageTypeCode ? { jenis: d.packageTypeCode } : {}) };
  if (d.grossWeight !== null) h.bruto = Number(d.grossWeight);
  if (d.netWeight !== null) h.netto = Number(d.netWeight);
  if (containers.length) h.kontainer = containers.map((k) => ({ nomor: k.containerNumber, ukuran: k.sizeCode, tipe: k.typeCode }));
  if (documents.length) h.dokumen = documents.map((x) => ({ jenis: x.documentTypeCode, nomor: x.number, tanggal: x.documentDate ?? '' }));
  if (guarantee) {
    h.jaminan = {
      ...(guarantee.guaranteeTypeCode ? { jenis: guarantee.guaranteeTypeCode } : {}), ...(guarantee.number ? { nomor: guarantee.number } : {}),
      ...(guarantee.guarantor ? { penjamin: guarantee.guarantor } : {}), ...(guarantee.amount !== null ? { nilai: Number(guarantee.amount) } : {}),
      ...(guarantee.dueDate ? { jatuhTempo: guarantee.dueDate } : {}),
    };
  }
  return h;
}

/** Every master code referenced by a header, grouped by master, for readable validation before writing. */
export function headerCodes(p: HeaderParts) {
  const c = p.columns;
  return {
    cara_angkut: [c.transportModeCode], pelabuhan: [c.loadingPortCode, c.destinationPortCode], negara: [c.originCountryCode, c.destinationCountryCode],
    incoterm: [c.incotermCode], kemasan: [c.packageTypeCode],
    ukuran_kontainer: p.containers.map((k) => k.sizeCode), tipe_kontainer: p.containers.map((k) => k.typeCode),
    jenis_dokumen: p.documents.map((d) => d.documentTypeCode), jenis_jaminan: [p.guarantee?.guaranteeTypeCode],
  } as Record<string, (string | null | undefined)[]>;
}

export const dutiesFromRow = (d: DocRow, treatmentName: string) => ({
  bm: Number(d.dutyBm), ppn: Number(d.dutyPpn), pph: Number(d.dutyPph), total: Number(d.dutyTotal), treatment: treatmentName,
});

/** CEISA event as the API has always shown it, with the response payload derived from columns. */
export const eventView = (aju: string, e: typeof customsDocEvents.$inferSelect) => ({
  id: e.id, docId: e.docId, status: e.status, code: e.code, message: e.message, createdAt: e.createdAt,
  payload: {
    nomorAju: aju, kodeRespon: e.code, uraianRespon: e.message,
    ...(e.registrationNumber ? { nomorDaftar: e.registrationNumber, tanggalDaftar: e.registrationDate } : {}),
  },
});
