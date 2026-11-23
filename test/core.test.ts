import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, verifyPassword } from '../src/core/password';
import { ajuNumber, businessDate, calcDuties, dueStages, stagesFor, validate, type MasterStage } from '../src/modules/customs-docs/customs-docs.domain';
import { MASTER_REFS } from '../scripts/seed-master';

// Stage + status master exactly as seeded, so the test covers the data-driven path (flags, not names).
const statusFlag = (code: string, flag: string) => !!MASTER_REFS.find((r) => r.type === 'status_dokumen' && r.code === code)?.meta?.[flag];
const MASTER: MasterStage[] = MASTER_REFS.filter((r) => r.type === 'tahap_ceisa').map((r) => {
  const m = r.meta as { status: string; afterSec: number };
  return { code: r.code, message: r.name, ...m, isReject: statusFlag(m.status, 'rejected'), isApproval: statusFlag(m.status, 'approved') };
});
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
  const ok = stagesFor(MASTER, SPPB, null);
  assert.deepEqual(dueStages(ok, t0, at(0)).map((s) => s.status), ['terkirim']);
  assert.deepEqual(dueStages(ok, t0, at(13)).map((s) => s.status), ['terkirim', 'diterima', 'tervalidasi']);
  assert.equal(dueStages(ok, t0, at(60)).at(-1)!.code, 'SPPB');
  assert.equal(dueStages(stagesFor(MASTER, NPE, null), t0, at(60)).at(-1)!.code, 'NPE');
  const rejected = dueStages(stagesFor(MASTER, SPPB, 'HS salah'), t0, at(60));
  assert.ok(statusFlag(rejected.at(-1)!.status, 'rejected'));
  assert.match(rejected.at(-1)!.message, /HS salah/);
  assert.ok(!rejected.some((s) => statusFlag(s.status, 'registered')), 'ditolak sebelum nomor pendaftaran terbit');
});

test('validasi CEISA menolak HS tidak lengkap dan pengangkut kosong', () => {
  assert.match(validate({ pengangkut: 'X' }, [{ hsCode: '5208' }])!, /HS/);
  assert.match(validate({}, [{ hsCode: '5208.52.00' }])!, /pengangkut/);
  assert.equal(validate({ pengangkut: 'X' }, [{ hsCode: '5208.52.00' }]), null);
  assert.match(validate({ pengangkut: 'X' }, [])!, /barang/);
});

test('password hash PBKDF2 diverifikasi dan menolak password salah', async () => {
  const h = await hashPassword('demo1234');
  assert.ok(await verifyPassword('demo1234', h));
  assert.ok(!(await verifyPassword('demo12345', h)));
  assert.ok(!(await verifyPassword('demo1234', 'rusak')));
});
