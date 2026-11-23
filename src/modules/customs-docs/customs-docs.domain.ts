// Pure business rules for BC documents. No I/O: all configuration (BC types, CEISA stages,
// tariffs, company id, timezone) comes from master data and is passed in.
import type { BcConfig, CeisaStage } from '../refs/refs.dto';

export type Stage = Pick<CeisaStage, 'status' | 'code' | 'message' | 'afterSec'>;
/** A master stage annotated with its status flags (from `status_dokumen`). */
export type MasterStage = Stage & { isReject: boolean; isApproval: boolean };
export type Problem = string | null;
export type DutyLine = { qty: number; unitPrice: number; bmRate: number; ppnRate: number; pphRate: number };

/** YYYY-MM-DD of `d` in the business timezone. */
export const businessDate = (d: Date, timeZone: string) => d.toLocaleDateString('sv-SE', { timeZone });

/** Nomor aju CEISA: 6 kode dokumen + 6 id perusahaan + 8 tanggal + 6 urut = 26 digit. */
export function ajuNumber(ceisaCode: string, companyId: string, ymd: string, seq: number): string {
  return ceisaCode.padStart(6, '0') + companyId.padStart(6, '0').slice(-6) + ymd.replaceAll('-', '') + String(seq).padStart(6, '0');
}

/** Pungutan dalam Rupiah: BM per pos tarif, PPN dan PPh dari (nilai pabean + BM). `duty` comes from master. */
export function calcDuties(duty: { label: string; charged: boolean }, lines: DutyLine[], kurs: number) {
  if (!duty.charged) return { bm: 0, ppn: 0, pph: 0, total: 0, treatment: duty.label };
  let bm = 0, ppn = 0, pph = 0;
  for (const l of lines) {
    const value = l.qty * l.unitPrice * kurs;
    const lineBm = value * (l.bmRate / 100);
    bm += lineBm;
    ppn += (value + lineBm) * (l.ppnRate / 100);
    pph += (value + lineBm) * (l.pphRate / 100);
  }
  const r = { bm: Math.round(bm), ppn: Math.round(ppn), pph: Math.round(pph) };
  return { ...r, total: r.bm + r.ppn + r.pph, treatment: duty.label };
}

/**
 * Stages a submitted document goes through, in time order. Approval stages take their code/message
 * from the BC type (SPPB, NPE, SPPJ…). With a validation problem, the document gets the normal stages
 * before the rejection time, then the rejection stage.
 */
export function stagesFor(master: MasterStage[], bc: Pick<BcConfig, 'approvalCode' | 'approvalMessage'>, problem: Problem): Stage[] {
  const strip = ({ isReject: _r, isApproval: _a, ...s }: MasterStage): Stage => s;
  const sorted = [...master].sort((a, b) => a.afterSec - b.afterSec);
  const normal = sorted.filter((s) => !s.isReject).map((s) => (s.isApproval ? { ...s, code: bc.approvalCode, message: bc.approvalMessage } : s));
  const reject = sorted.find((s) => s.isReject);
  if (!problem || !reject) return normal.map(strip);
  return [...normal.filter((s) => s.afterSec < reject.afterSec).map(strip), { ...strip(reject), message: `${reject.message}: ${problem}` }];
}

export function dueStages(stages: Stage[], submittedAt: Date, now: Date): Stage[] {
  const elapsed = (now.getTime() - submittedAt.getTime()) / 1000;
  return stages.filter((s) => s.afterSec <= elapsed);
}

/** Deterministic 6-digit registration number from the aju number. */
export function registrationNumber(aju: string): string {
  let h = 0;
  for (const ch of aju) h = (h * 31 + ch.charCodeAt(0)) % 1_000_000;
  return String(h).padStart(6, '0');
}

/** Same checks CEISA runs on header/lines; returns the first rejection reason. */
export function validate(header: Record<string, unknown>, lines: { hsCode: string | null }[]): Problem {
  if (!lines.length) return 'Dokumen tidak memiliki data barang';
  const noHs = lines.findIndex((l) => !l.hsCode || l.hsCode.replace(/\D/g, '').length < 8);
  if (noHs >= 0) return `Barang ke-${noHs + 1}: Pos tarif/HS (8 digit) tidak valid`;
  if (!header.pengangkut) return 'Data pengangkut wajib diisi';
  return null;
}
