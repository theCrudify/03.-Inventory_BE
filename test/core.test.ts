import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pgTable, serial, text } from 'drizzle-orm/pg-core';
import { asc } from 'drizzle-orm';
import { envelope, orderByFor, pageQuery, searchSql, toLimit } from '../src/core/http';
import { hashPassword, verifyPassword } from '../src/core/password';
import { ajuNumber, businessDate, calcDuties, dueStages, stagesFor, validate, type MasterStage } from '../src/modules/customs-docs/customs-docs.domain';
import { headerBody } from '../src/modules/customs-docs/customs-docs.dto';
import { headerCodes, headerToParts, partsToHeader } from '../src/modules/customs-docs/customs-docs.mapper';
import { MASTER, MASTER_STATUSES } from '../scripts/seed-master';

// Stage + status master exactly as seeded, so the test covers the data-driven path (flags, not names).
const statusFlag = (code: string, flag: 'rejected' | 'approved' | 'registered') => !!MASTER_STATUSES.find((x) => x.code === code)?.[flag];
const STAGES: MasterStage[] = MASTER.ceisaStages.map((r) => ({
  code: r.code, message: r.message, status: r.statusCode, afterSec: r.afterSec,
  isReject: statusFlag(r.statusCode, 'rejected'), isApproval: statusFlag(r.statusCode, 'approved'),
}));
const DEFERRED = { label: 'Ditangguhkan', charged: true };
const PAID = { label: 'Dibayar', charged: true };
const NOT_CHARGED = { label: 'Tidak dipungut', charged: false };
const SPPB = { approvalCode: 'SPPB', approvalMessage: 'SPPB diterbitkan' };
const NPE = { approvalCode: 'NPE', approvalMessage: 'NPE diterbitkan' };

test('nomor aju 26 digit: kode dokumen, id perusahaan, tanggal, urut', () => {
  assert.equal(ajuNumber('23', '120345', '2026-11-23', 7), '00002312034520261123000007');
  assert.equal(ajuNumber('261', '120345', '2026-11-23', 1).slice(0, 6), '000261');
});

test('tanggal bisnis memakai zona waktu perusahaan, bukan UTC', () => {
  const earlyMorningWib = new Date('2026-11-22T20:30:00Z'); // 03:30 WIB tanggal 23
  assert.equal(businessDate(earlyMorningWib, 'Asia/Jakarta'), '2026-11-23');
  assert.equal(businessDate(earlyMorningWib, 'UTC'), '2026-11-22');
});

test('pungutan memakai tarif per pos (BM, PPN, PPh dari master HS)', () => {
  const lines = [{ qty: 100, unitPrice: 10, bmRate: 10, ppnRate: 11, pphRate: 2.5 }]; // 1000 USD
  const d = calcDuties(DEFERRED, lines, 16000); // nilai pabean 16jt, BM 1,6jt
  assert.equal(d.bm, 1_600_000);
  assert.equal(d.ppn, Math.round(17_600_000 * 0.11));
  assert.equal(d.pph, Math.round(17_600_000 * 0.025));
  assert.equal(d.total, d.bm + d.ppn + d.pph);
  assert.equal(calcDuties(PAID, [{ ...lines[0], ppnRate: 12 }], 16000).ppn, Math.round(17_600_000 * 0.12));
  assert.deepEqual(calcDuties(NOT_CHARGED, lines, 16000), { bm: 0, ppn: 0, pph: 0, total: 0, treatment: 'Tidak dipungut' });
});

test('tahapan CEISA dari master: kode persetujuan mengikuti jenis BC', () => {
  const t0 = new Date('2026-01-01T00:00:00Z');
  const at = (s: number) => new Date(t0.getTime() + s * 1000);
  const ok = stagesFor(STAGES, SPPB, null);
  assert.deepEqual(dueStages(ok, t0, at(0)).map((s) => s.status), ['terkirim']);
  assert.deepEqual(dueStages(ok, t0, at(13)).map((s) => s.status), ['terkirim', 'diterima', 'tervalidasi']);
  assert.equal(dueStages(ok, t0, at(60)).at(-1)!.code, 'SPPB');
  assert.equal(dueStages(stagesFor(STAGES, NPE, null), t0, at(60)).at(-1)!.code, 'NPE');
  const rejected = dueStages(stagesFor(STAGES, SPPB, 'HS salah'), t0, at(60));
  assert.ok(statusFlag(rejected.at(-1)!.status, 'rejected'));
  assert.match(rejected.at(-1)!.message, /HS salah/);
  assert.ok(!rejected.some((s) => statusFlag(s.status, 'registered')), 'ditolak sebelum nomor pendaftaran terbit');
});

test('validasi CEISA menolak HS tidak lengkap dan pengangkut kosong', () => {
  assert.match(validate('X', [{ hsCode: '5208' }])!, /HS/);
  assert.match(validate(null, [{ hsCode: '5208.52.00' }])!, /pengangkut/);
  assert.equal(validate('X', [{ hsCode: '5208.52.00' }]), null);
  assert.match(validate('X', [])!, /barang/);
});

test('password hash PBKDF2 diverifikasi dan menolak password salah', async () => {
  const h = await hashPassword('demo1234');
  assert.ok(await verifyPassword('demo1234', h));
  assert.ok(!(await verifyPassword('demo12345', h)));
  assert.ok(!(await verifyPassword('demo1234', 'rusak')));
});

test('query pagination, multi-token searchSql, dan whitelisted orderByFor', () => {
  const q = pageQuery.parse({ page: '2', pageSize: '15', q: '  kain katun  ', sortBy: 'name', sortDir: 'desc' });
  assert.deepEqual(toLimit(q), { limit: 15, offset: 15 });
  assert.deepEqual(envelope([{ id: 1, total: 21 }, { id: 2, total: 21 }], q), {
    data: [{ id: 1 }, { id: 2 }], total: 21, page: 2, pageSize: 15,
  });
  const tbl = pgTable('dummy', { id: serial('id').primaryKey(), name: text('name').notNull() });
  assert.equal(searchSql('   ', [tbl.name]), undefined);
  assert.ok(searchSql('kain 5208', [tbl.name]));
  const fallback = [asc(tbl.id)];
  assert.equal(orderByFor({ name: tbl.name }, 'unknown_col', 'desc', fallback).length, 1);
  assert.equal(orderByFor({ name: tbl.name }, 'name', 'desc', fallback).length, 2);
});

test('header API dipecah ke kolom + tabel anak lalu dirakit kembali persis sama', () => {
  const header = headerBody.parse({
    caraAngkut: '1', pengangkut: 'MV. SINAR', nomorVoyage: '0126S', pelabuhanMuat: 'CNNGB', pelabuhanTujuan: 'IDTPP', negaraAsal: 'CN', incoterm: 'CIF',
    kemasan: { jumlah: 360, jenis: 'RO' }, bruto: 9150, netto: 8820,
    kontainer: [{ nomor: 'TGHU 418273-6', ukuran: '40', tipe: 'FCL' }, { nomor: '  ', ukuran: '20', tipe: 'LCL' }],
    dokumen: [{ jenis: 'INV', nomor: 'HRT-1', tanggal: '2026-06-01' }, { jenis: 'BL', nomor: '' }],
    jaminan: { jenis: 'CB', nomor: 'CB/1', penjamin: 'PT X', nilai: 18250000, jatuhTempo: '2027-01-31' },
  });
  const p = headerToParts(header);
  assert.equal(p.columns.transportModeCode, '1');
  assert.equal(p.columns.grossWeight, '9150');
  assert.equal(p.containers.length, 1, 'baris kosong dibuang');
  assert.equal(p.documents.length, 1);
  assert.deepEqual(headerCodes(p).ukuran_kontainer, ['40']);

  // simulate what the database returns, then rebuild
  const row = { ...p.columns } as never;
  const rebuilt = partsToHeader(row, p.containers.map((k, i) => ({ id: i, docId: 1, ...k })) as never, p.documents.map((d, i) => ({ id: i, docId: 1, ...d })) as never, { docId: 1, ...p.guarantee! } as never);
  assert.deepEqual(rebuilt, {
    caraAngkut: '1', pengangkut: 'MV. SINAR', nomorVoyage: '0126S', pelabuhanMuat: 'CNNGB', pelabuhanTujuan: 'IDTPP', negaraAsal: 'CN', incoterm: 'CIF',
    kemasan: { jumlah: 360, jenis: 'RO' }, bruto: 9150, netto: 8820,
    kontainer: [{ nomor: 'TGHU 418273-6', ukuran: '40', tipe: 'FCL' }],
    dokumen: [{ jenis: 'INV', nomor: 'HRT-1', tanggal: '2026-06-01' }],
    jaminan: { jenis: 'CB', nomor: 'CB/1', penjamin: 'PT X', nilai: 18250000, jatuhTempo: '2027-01-31' },
  });
});

test('header kosong menghasilkan kolom null dan tanpa tabel anak', () => {
  const p = headerToParts(headerBody.parse({ pengangkut: '', jaminan: {} }));
  assert.equal(p.columns.carrierName, null);
  assert.equal(p.guarantee, null);
  assert.deepEqual([p.containers, p.documents], [[], []]);
});

test('seed master konsisten: semua kode yang dirujuk ada di tabel masternya', () => {
  const has = (rows: { code: string }[], code: string | null) => code === null || rows.some((r) => r.code === code);
  for (const p of MASTER.ports) assert.ok(has(MASTER.countries, p.countryCode), `negara pelabuhan ${p.code}`);
  for (const b of MASTER.bcTypes) {
    assert.ok(has(MASTER.directions, b.directionCode) && has(MASTER.partnerKinds, b.partnerKindCode) && has(MASTER.customsOffices, b.defaultOfficeCode)
      && has(MASTER.dutyTreatments, b.dutyTreatmentCode) && has(MASTER.sourceDocTypes, b.sourceDocCode), `jenis BC ${b.code}`);
  }
  for (const st of MASTER.ceisaStages) assert.ok(has(MASTER_STATUSES, st.statusCode), `tahap ${st.code}`);
  assert.equal(MASTER_STATUSES.filter((x) => x.initial).length, 1, 'tepat satu status awal');
  assert.ok(MASTER.directions.every((d) => d.sign === 1 || d.sign === -1));
});
