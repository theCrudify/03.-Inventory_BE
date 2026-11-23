// Demo data for a fictional garment manufacturer in a bonded zone. Wipes and refills every table.
// Run: npm run db:seed   (reads DATABASE_URL from .env)
import { sql } from 'drizzle-orm';
import { createDb } from '../src/core/db/client';
import * as s from '../src/core/db/schema';
import { hashPassword } from '../src/core/password';
import { ajuNumber, businessDate, calcDuties } from '../src/modules/customs-docs/customs-docs.domain';
import { createCustomsDocsRepository } from '../src/modules/customs-docs/customs-docs.repository';
import { createCustomsDocsService } from '../src/modules/customs-docs/customs-docs.service';
import { headerBody } from '../src/modules/customs-docs/customs-docs.dto';
import { headerToParts } from '../src/modules/customs-docs/customs-docs.mapper';
import { DEMO_PASSWORD, MASTER, MASTER_SETTINGS } from './seed-master';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL belum diset (lihat .env.example)');
const { db, close } = createDb(url);
const { timezone } = MASTER_SETTINGS.company;
const DAY = 86_400_000;
const daysAgo = (d: number) => new Date(Date.now() - d * DAY);
const ymd = (d: Date) => businessDate(d, timezone);

// Empty every table in the schema, then refill in foreign-key order.
await db.execute(sql`do $$ declare r record; begin
  for r in select tablename from pg_tables where schemaname = 'public' loop
    execute format('truncate table %I restart identity cascade', r.tablename);
  end loop; end $$`);

// ---------- Master: one table each ----------
await db.insert(s.roles).values(MASTER.roles);
await db.insert(s.documentStatuses).values(MASTER.documentStatuses);
await db.insert(s.countries).values(MASTER.countries);
await db.insert(s.ports).values(MASTER.ports);
await db.insert(s.units).values(MASTER.units);
await db.insert(s.packagings).values(MASTER.packagings);
await db.insert(s.currencies).values(MASTER.currencies);
await db.insert(s.customsOffices).values(MASTER.customsOffices);
await db.insert(s.incoterms).values(MASTER.incoterms);
await db.insert(s.hsCodes).values(MASTER.hsCodes);
await db.insert(s.documentTypes).values(MASTER.documentTypes);
await db.insert(s.transportModes).values(MASTER.transportModes);
await db.insert(s.containerSizes).values(MASTER.containerSizes);
await db.insert(s.containerTypes).values(MASTER.containerTypes);
await db.insert(s.guaranteeTypes).values(MASTER.guaranteeTypes);
await db.insert(s.itemCategories).values(MASTER.itemCategories);
await db.insert(s.partnerKinds).values(MASTER.partnerKinds);
await db.insert(s.directions).values(MASTER.directions);
await db.insert(s.dutyTreatments).values(MASTER.dutyTreatments);
await db.insert(s.stockSources).values(MASTER.stockSources);
await db.insert(s.sourceDocTypes).values(MASTER.sourceDocTypes);
await db.insert(s.bcTypes).values(MASTER.bcTypes);
await db.insert(s.ceisaStages).values(MASTER.ceisaStages);
const masterRows = Object.values(MASTER).reduce((n, rows) => n + rows.length, 0);

const { company, app } = MASTER_SETTINGS;
await db.insert(s.companyProfile).values({
  id: 1, name: company.name, npwp: company.npwp, izinKb: company.izinKb, companyId: company.companyId, address: company.address, city: company.city,
  timezone: company.timezone, signatoryName: company.signatory.name, signatoryTitle: company.signatory.title,
});
await db.insert(s.appSettings).values({
  id: 1, name: app.name, subtitle: app.subtitle, tagline: app.tagline, description: app.description, environmentLabel: app.environmentLabel,
  footnote: app.footnote, printHeader: app.printHeader, printFootnote: app.printFootnote, demoPassword: app.demo?.password ?? null,
});
await db.insert(s.appFeatures).values(app.features.map((text, sort) => ({ text, sort })));

const bcOf = (code: string) => MASTER.bcTypes.find((b) => b.code === code)!;
const tariff = new Map(MASTER.hsCodes.map((h) => [h.code, h]));
const dutyOf = (code: string) => { const d = MASTER.dutyTreatments.find((x) => x.code === code)!; return { code: d.code, label: d.name, charged: d.charged }; };
const initialStatus = MASTER.documentStatuses.find((x) => x.initial)!.code;
const kursOf = (cur: string) => Number(MASTER.currencies.find((c) => c.code === cur)!.rate);

const pw = await hashPassword(DEMO_PASSWORD);
const users = await db.insert(s.users).values([
  { name: 'Rina Kusuma', email: 'admin@arunika.demo', passwordHash: pw, role: 'admin' },
  { name: 'Budi Santoso', email: 'operator@arunika.demo', passwordHash: pw, role: 'operator' },
  { name: 'Auditor Bea Cukai', email: 'viewer@arunika.demo', passwordHash: pw, role: 'viewer' },
]).returning();
if (app.demo) {
  await db.insert(s.demoAccounts).values(app.demo.accounts.map((a, sort) => ({ userId: users.find((u) => u.email === a.email)!.id, label: a.label, description: a.description, sort })));
}

// ---------- Mitra ----------
const partners = await db.insert(s.partners).values([
  { kind: 'supplier', name: 'Zhejiang Huarong Textile Co., Ltd.', address: 'No. 88 Keqiao Road, Shaoxing, Zhejiang', countryCode: 'CN' },
  { kind: 'supplier', name: 'Osaka Fine Trims Corporation', address: '2-14 Minamisenba, Chuo-ku, Osaka', countryCode: 'JP' },
  { kind: 'supplier', name: 'Saigon Thread & Accessories JSC', address: '120 Nguyen Van Linh, District 7, Ho Chi Minh City', countryCode: 'VN' },
  { kind: 'supplier', name: 'PT Benang Prima Sejahtera', npwp: '013456789012000', address: 'Jl. Raya Bandung KM 21, Sumedang', countryCode: 'ID' },
  { kind: 'supplier', name: 'PT Kawasan Berikat Mitra Garmen', npwp: '021987654321000', address: 'Kawasan Industri MM2100 Blok C-3, Cikarang Barat', countryCode: 'ID' },
  { kind: 'customer', name: 'Northwind Apparel Inc.', address: '500 Fashion Ave, New York, NY 10018', countryCode: 'US' },
  { kind: 'customer', name: 'Kaze Retail K.K.', address: '1-1-2 Shibuya, Shibuya-ku, Tokyo', countryCode: 'JP' },
  { kind: 'customer', name: 'PT Sandang Retail Indonesia', npwp: '031122334455000', address: 'Jl. Gajah Mada No. 18, Jakarta Pusat', countryCode: 'ID' },
  { kind: 'customer', name: 'PT Kawasan Berikat Mitra Garmen', npwp: '021987654321000', address: 'Kawasan Industri MM2100 Blok C-3, Cikarang Barat', countryCode: 'ID' },
  { kind: 'subkontraktor', name: 'CV Bordir Rapi Mandiri', npwp: '041234567890000', address: 'Jl. Industri Kecil No. 7, Tasikmalaya', countryCode: 'ID' },
  { kind: 'ppjk', name: 'PT Lintas Kepabeanan Nusantara', npwp: '051234567890000', address: 'Jl. Enggano No. 5, Tanjung Priok', countryCode: 'ID' },
  { kind: 'pengangkut', name: 'PT Samudera Logistik Cepat', npwp: '061234567890000', address: 'Jl. Yos Sudarso Kav. 30, Jakarta Utara', countryCode: 'ID' },
]).returning();
const P = (name: string, kind = 'supplier') => partners.find((p) => p.kind === kind && p.name.startsWith(name))!.id;

// ---------- Barang ----------
const items = await db.insert(s.items).values([
  { code: 'BB-FAB-001', name: 'Kain katun print 40s lebar 58"', category: 'bahan_baku', hsCode: '5208.52.00', uom: 'MTR' },
  { code: 'BB-FAB-002', name: 'Kain polyester taffeta 190T', category: 'bahan_baku', hsCode: '5407.61.90', uom: 'MTR' },
  { code: 'BB-THR-001', name: 'Benang jahit katun 40/2 putih', category: 'bahan_baku', hsCode: '5204.11.10', uom: 'CON' },
  { code: 'BB-BTN-001', name: 'Kancing plastik 4 lubang 18L', category: 'bahan_baku', hsCode: '9606.21.00', uom: 'PCE' },
  { code: 'BB-LBL-001', name: 'Label tenun merek', category: 'bahan_baku', hsCode: '5807.10.00', uom: 'PCE' },
  { code: 'BP-PKG-001', name: 'Polybag 30x40 cm', category: 'bahan_baku', hsCode: '3923.21.99', uom: 'PCE' },
  { code: 'BP-TAG-001', name: 'Hang tag kertas', category: 'bahan_baku', hsCode: '4821.10.90', uom: 'PCE' },
  { code: 'FG-SHT-001', name: 'Kemeja pria lengan panjang katun', category: 'barang_jadi', hsCode: '6205.20.90', uom: 'PCE' },
  { code: 'FG-PNT-001', name: 'Celana panjang wanita katun', category: 'barang_jadi', hsCode: '6204.62.00', uom: 'PCE' },
  { code: 'FG-TEE-001', name: 'Kaos T-shirt katun combed 30s', category: 'barang_jadi', hsCode: '6109.10.10', uom: 'PCE' },
  { code: 'MS-SEW-001', name: 'Mesin jahit lockstitch otomatis', category: 'mesin', hsCode: '8452.21.00', uom: 'UNT' },
  { code: 'MS-SEW-002', name: 'Mesin obras 4 benang', category: 'mesin', hsCode: '8452.21.00', uom: 'UNT' },
  { code: 'SC-FAB-001', name: 'Sisa potongan kain (majun)', category: 'scrap', hsCode: '6310.10.90', uom: 'KGM' },
]).returning();
const I = (code: string) => items.find((i) => i.code === code)!.id;

// ---------- PO & Invoice ----------
const tradeSeeds = [
  { kind: 'po', number: 'PO/ATN/2026/0412', date: ymd(daysAgo(170)), partnerId: P('Zhejiang'), currency: 'USD', incoterm: 'CIF', lines: [{ itemId: I('BB-FAB-001'), qty: 24000, unitPrice: 1.85 }, { itemId: I('BB-FAB-002'), qty: 12000, unitPrice: 1.2 }] },
  { kind: 'po', number: 'PO/ATN/2026/0418', date: ymd(daysAgo(150)), partnerId: P('Osaka'), currency: 'USD', incoterm: 'FOB', lines: [{ itemId: I('BB-BTN-001'), qty: 400000, unitPrice: 0.012 }, { itemId: I('BB-LBL-001'), qty: 120000, unitPrice: 0.03 }] },
  { kind: 'po', number: 'PO/ATN/2026/0431', date: ymd(daysAgo(60)), partnerId: P('Saigon'), currency: 'USD', incoterm: 'CIF', lines: [{ itemId: I('BB-THR-001'), qty: 6000, unitPrice: 1.4 }] },
  { kind: 'invoice', number: 'INV-NWA-26-0091', date: ymd(daysAgo(70)), partnerId: P('Northwind', 'customer'), currency: 'USD', incoterm: 'FOB', lines: [{ itemId: I('FG-SHT-001'), qty: 6000, unitPrice: 9.5 }] },
  { kind: 'invoice', number: 'INV-KAZ-26-0033', date: ymd(daysAgo(25)), partnerId: P('Kaze', 'customer'), currency: 'USD', incoterm: 'FOB', lines: [{ itemId: I('FG-TEE-001'), qty: 8000, unitPrice: 4.2 }] },
];
const trade: (typeof s.tradeDocs.$inferSelect)[] = [];
for (const { lines, ...doc } of tradeSeeds) {
  const [row] = await db.insert(s.tradeDocs).values({ ...doc, total: lines.reduce((sum, l) => sum + l.qty * l.unitPrice, 0).toFixed(2) }).returning();
  await db.insert(s.tradeDocLines).values(lines.map((l) => ({ tradeDocId: row.id, itemId: l.itemId, qty: String(l.qty), unitPrice: String(l.unitPrice) })));
  trade.push(row);
}
const T = (no: string) => trade.find((t) => t.number === no)!.id;

// ---------- Dokumen BC (header values are reference codes) ----------
const LAUT = '1', UDARA = '4', DARAT = '3';
const vessel = (name: string, voy: string, muat: string, tujuan: string, extra: Record<string, unknown> = {}) => ({
  caraAngkut: LAUT, pengangkut: name, nomorVoyage: voy, pelabuhanMuat: muat, pelabuhanTujuan: tujuan, ...extra,
});
const truck = (plat: string, extra: Record<string, unknown> = {}) => ({ caraAngkut: DARAT, pengangkut: `Truk ${plat}`, nomorPolisi: plat, ...extra });
const docs = (no: string, date: Date, more: { jenis: string; nomor: string }[] = []) => [
  { jenis: 'INV', nomor: no, tanggal: ymd(date) }, { jenis: 'PL', nomor: `PL-${no}`, tanggal: ymd(date) }, ...more.map((m) => ({ ...m, tanggal: ymd(date) })),
];

type Seed = {
  bc: string; ago: number; partner: number; office?: string; currency?: string; trade?: number;
  header: Record<string, unknown>; lines: [string, number, number][]; state: 'done' | 'reject' | 'live' | 'draft';
};
const seeds: Seed[] = [
  { bc: '23', ago: 160, partner: P('Zhejiang'), trade: T('PO/ATN/2026/0412'), state: 'done', lines: [['BB-FAB-001', 24000, 1.85], ['BB-FAB-002', 12000, 1.2]],
    header: vessel('MV. SINAR BAHARI', '0126S', 'CNNGB', 'IDTPP', { negaraAsal: 'CN', incoterm: 'CIF', kemasan: { jumlah: 360, jenis: 'RO' }, kontainer: [{ nomor: 'TGHU 418273-6', ukuran: '40', tipe: 'FCL' }], bruto: 9150, netto: 8820, dokumen: docs('HRT-26-1182', daysAgo(165), [{ jenis: 'BL', nomor: 'NGBJKT260118' }, { jenis: 'COO', nomor: 'E26CN0011882' }]) }) },
  { bc: '23', ago: 140, partner: P('Osaka'), trade: T('PO/ATN/2026/0418'), state: 'done', lines: [['BB-BTN-001', 400000, 0.012], ['BB-LBL-001', 120000, 0.03]],
    header: { caraAngkut: UDARA, pengangkut: 'GA 889', nomorVoyage: 'GA889', pelabuhanMuat: 'JPTYO', pelabuhanTujuan: 'IDTPP', negaraAsal: 'JP', incoterm: 'FOB', kemasan: { jumlah: 42, jenis: 'CT' }, bruto: 610, netto: 575, dokumen: docs('OFT-2026-0418', daysAgo(142), [{ jenis: 'AWB', nomor: '126-48812736' }]) } },
  { bc: '23', ago: 55, partner: P('Saigon'), trade: T('PO/ATN/2026/0431'), state: 'done', lines: [['BB-THR-001', 6000, 1.4]],
    header: vessel('MV. MEKONG STAR', '0331S', 'VNSGN', 'IDTPP', { negaraAsal: 'VN', incoterm: 'CIF', kemasan: { jumlah: 250, jenis: 'CT' }, kontainer: [{ nomor: 'SEGU 220917-3', ukuran: '20', tipe: 'FCL' }], bruto: 3300, netto: 3000, dokumen: docs('STA-0331', daysAgo(57), [{ jenis: 'BL', nomor: 'SGNJKT0331' }]) }) },
  { bc: '40', ago: 120, partner: P('PT Benang'), currency: 'IDR', state: 'done', lines: [['BP-PKG-001', 60000, 450], ['BP-TAG-001', 60000, 300]],
    header: truck('B 9127 KXT', { kemasan: { jumlah: 30, jenis: 'BX' }, bruto: 480, netto: 450, dokumen: docs('BPS/INV/2026/221', daysAgo(121), [{ jenis: 'FP', nomor: '010.002-26.48812271' }]) }) },
  { bc: '27in', ago: 90, partner: P('PT Kawasan'), state: 'done', lines: [['MS-SEW-001', 10, 2850], ['MS-SEW-002', 6, 1900]],
    header: truck('B 9004 FQE', { kemasan: { jumlah: 16, jenis: 'CS' }, bruto: 1450, netto: 1280, tujuanPengiriman: 'Pemindahtanganan mesin antar Kawasan Berikat', dokumen: docs('KBMG-26-0071', daysAgo(91)) }) },
  { bc: '261', ago: 100, partner: P('CV Bordir', 'subkontraktor'), state: 'done', lines: [['BB-FAB-001', 3000, 1.85]],
    header: truck('D 8811 TS', { tujuanPengiriman: 'Subkontrak pekerjaan bordir', kemasan: { jumlah: 45, jenis: 'RO' }, bruto: 1150, netto: 1110, jaminan: { jenis: 'CB', nomor: 'CB/ASK/26/00981', penjamin: 'PT Asuransi Kredit Nusantara', nilai: 18250000, jatuhTempo: ymd(daysAgo(-80)) }, dokumen: docs('SPK/ATN/26/014', daysAgo(101), [{ jenis: 'KTR', nomor: 'KTR/ATN-CBR/2026/03' }]) }) },
  { bc: '262', ago: 75, partner: P('CV Bordir', 'subkontraktor'), state: 'done', lines: [['BB-FAB-001', 2950, 1.85]],
    header: truck('D 8811 TS', { kemasan: { jumlah: 44, jenis: 'RO' }, bruto: 1130, netto: 1092, dokumen: docs('CBR/SJ/26/0088', daysAgo(76), [{ jenis: 'SJ', nomor: 'CBR/SJ/26/0088' }]) }) },
  { bc: '30', ago: 65, partner: P('Northwind', 'customer'), trade: T('INV-NWA-26-0091'), state: 'done', lines: [['FG-SHT-001', 6000, 9.5]],
    header: vessel('MV. PACIFIC HORIZON', '0412E', 'IDTPP', 'USLAX', { negaraTujuan: 'US', incoterm: 'FOB', kemasan: { jumlah: 250, jenis: 'CT' }, kontainer: [{ nomor: 'MSKU 771902-4', ukuran: '40HC', tipe: 'FCL' }], bruto: 2875, netto: 2400, dokumen: docs('INV-NWA-26-0091', daysAgo(68), [{ jenis: 'BKG', nomor: 'BKG-PH-0412-77' }]) }) },
  { bc: '30', ago: 20, partner: P('Kaze', 'customer'), trade: T('INV-KAZ-26-0033'), state: 'done', lines: [['FG-TEE-001', 8000, 4.2]],
    header: vessel('MV. KIZUNA MARU', '0607N', 'IDTPP', 'JPTYO', { negaraTujuan: 'JP', incoterm: 'FOB', kemasan: { jumlah: 200, jenis: 'CT' }, kontainer: [{ nomor: 'ONEU 330218-9', ukuran: '40', tipe: 'FCL' }], bruto: 2100, netto: 1760, dokumen: docs('INV-KAZ-26-0033', daysAgo(22)) }) },
  { bc: '25', ago: 35, partner: P('PT Sandang', 'customer'), state: 'done', lines: [['FG-PNT-001', 1500, 7.8]],
    header: truck('B 9532 UYT', { kemasan: { jumlah: 60, jenis: 'CT' }, bruto: 780, netto: 690, dokumen: docs('ATN/INV/LOC/26/044', daysAgo(36), [{ jenis: 'FP', nomor: '010.002-26.48817310' }]) }) },
  { bc: '41', ago: 15, partner: P('PT Sandang', 'customer'), currency: 'IDR', state: 'done', lines: [['SC-FAB-001', 850, 3500]],
    header: truck('B 9881 PLM', { tujuanPengiriman: 'Penjualan sisa produksi (majun) ke TLDDP', bruto: 870, netto: 850, dokumen: docs('ATN/SCR/26/007', daysAgo(16)) }) },
  { bc: '27out', ago: 10, partner: P('PT Kawasan', 'customer'), state: 'done', lines: [['FG-SHT-001', 800, 9.1]],
    header: truck('B 9004 FQE', { tujuanPengiriman: 'Penjualan barang jadi ke TPB lain', kemasan: { jumlah: 34, jenis: 'CT' }, bruto: 390, netto: 320, dokumen: docs('ATN/INV/KB/26/012', daysAgo(11)) }) },
  // Rejected by CEISA (no carrier): shows the rejection flow.
  { bc: '23', ago: 8, partner: P('Zhejiang'), state: 'reject', lines: [['BB-FAB-002', 5000, 1.22]],
    header: { negaraAsal: 'CN', incoterm: 'CIF', kemasan: { jumlah: 50, jenis: 'RO' }, bruto: 1300, netto: 1250, dokumen: docs('HRT-26-1260', daysAgo(9)) } },
  // Submitted at seed time: progresses live during a demo.
  { bc: '30', ago: 0, partner: P('Northwind', 'customer'), state: 'live', lines: [['FG-SHT-001', 1200, 9.5]],
    header: vessel('MV. PACIFIC HORIZON', '0509E', 'IDTPP', 'USLAX', { negaraTujuan: 'US', incoterm: 'FOB', kemasan: { jumlah: 50, jenis: 'CT' }, bruto: 580, netto: 480, dokumen: docs('INV-NWA-26-0118', daysAgo(1)) }) },
  { bc: '23', ago: 0, partner: P('Osaka'), state: 'draft', lines: [['BB-BTN-001', 250000, 0.012]],
    header: { caraAngkut: UDARA, pengangkut: 'JL 725', pelabuhanMuat: 'JPTYO', pelabuhanTujuan: 'IDTPP', negaraAsal: 'JP', incoterm: 'FOB', kemasan: { jumlah: 25, jenis: 'CT' }, dokumen: docs('OFT-2026-0502', daysAgo(0)) } },
  { bc: '25', ago: 0, partner: P('PT Sandang', 'customer'), state: 'draft', lines: [['FG-TEE-001', 1000, 4.5]],
    header: truck('B 9532 UYT', { kemasan: { jumlah: 25, jenis: 'CT' }, dokumen: docs('ATN/INV/LOC/26/051', daysAgo(0)) }) },
];

// Production between inbound and outbound documents: bahan baku consumed, barang jadi produced.
const production: [number, string, number][] = [
  [130, 'BB-FAB-001', -11000], [130, 'BB-BTN-001', -80000], [130, 'BB-LBL-001', -14000], [130, 'FG-SHT-001', 7200],
  [110, 'BP-PKG-001', -14000], [110, 'BP-TAG-001', -14000],
  [85, 'BB-FAB-001', -5000], [85, 'FG-PNT-001', 2600], [85, 'SC-FAB-001', 1200],
  [45, 'BB-FAB-002', -8500], [45, 'BB-THR-001', -2600], [45, 'FG-TEE-001', 9200], [45, 'SC-FAB-001', 400],
  [5, 'FG-SHT-001', 1500], [5, 'BB-FAB-001', -2200],
];
await db.insert(s.stockMovements).values(production.map(([ago, code, qty]) => ({
  itemId: I(code), source: 'produksi' as const, qty: String(qty), date: ymd(daysAgo(ago)), note: qty > 0 ? 'Hasil produksi' : 'Pemakaian produksi',
})));
await db.insert(s.stockMovements).values({ itemId: I('BB-THR-001'), source: 'penyesuaian', qty: '-12', date: ymd(daysAgo(30)), note: 'Selisih stock opname Q3' });

const customs = createCustomsDocsService(db);
const customsRepo = createCustomsDocsRepository(db);
const firstStage = [...MASTER.ceisaStages].sort((a, b) => a.afterSec - b.afterSec)[0];
let seq = 0;
for (const d of seeds.sort((a, b) => b.ago - a.ago)) {
  const bc = bcOf(d.bc);
  const created = daysAgo(d.ago + 2);
  const currency = d.currency ?? 'USD';
  const kurs = kursOf(currency);
  const lines = d.lines.map(([code, qty, unitPrice]) => {
    const it = items.find((i) => i.code === code)!;
    const t = tariff.get(it.hsCode!)!;
    return { itemId: it.id, hsCode: it.hsCode, qty, unitPrice, bmRate: Number(t.bmRate), ppnRate: Number(t.ppnRate), pphRate: Number(t.pphRate) };
  });
  const duties = calcDuties(dutyOf(bc.dutyTreatmentCode), lines, kurs);
  const parts = headerToParts(headerBody.parse(d.header));
  const doc = await customsRepo.insert({
    bcType: bc.code, ajuNumber: ajuNumber(bc.ceisaCode, company.companyId, ymd(created), ++seq), partnerId: d.partner, tradeDocId: d.trade ?? null,
    officeCode: d.office ?? bc.defaultOfficeCode, currency, kurs: String(kurs), status: initialStatus,
    totalValue: lines.reduce((a, l) => a + l.qty * l.unitPrice, 0).toFixed(2), ...parts.columns,
    dutyBm: String(duties.bm), dutyPpn: String(duties.ppn), dutyPph: String(duties.pph), dutyTotal: String(duties.total), dutyTreatmentCode: bc.dutyTreatmentCode,
    createdBy: 2, createdAt: created, updatedAt: created,
  }, {
    lines: lines.map((l) => ({ itemId: l.itemId, hsCode: l.hsCode, qty: String(l.qty), unitPrice: String(l.unitPrice), bmRate: String(l.bmRate), ppnRate: String(l.ppnRate), pphRate: String(l.pphRate) })),
    containers: parts.containers, documents: parts.documents, guarantee: parts.guarantee,
  });
  if (d.state === 'draft') continue;
  // Same path as POST /customs-docs/:id/submit, then advance() materialises every due stage and books stock.
  const at = d.state === 'live' ? new Date() : daysAgo(d.ago);
  const sent = await customsRepo.markSubmitted(doc.id, at, {
    status: firstStage.statusCode, code: firstStage.code, message: firstStage.message, createdAt: at,
  });
  await customs.advance(sent);
}

await db.insert(s.auditLogs).values({ userId: 1, action: 'login', entity: 'user', entityId: 1, createdAt: daysAgo(1) });

const [{ n }] = await db.execute<{ n: number }>(sql`select count(*)::int n from customs_docs`);
console.log(`Seed selesai: ${n} dokumen BC, ${items.length} barang, ${partners.length} mitra, ${masterRows} baris master.`);
await close();
