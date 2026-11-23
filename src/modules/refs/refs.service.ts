import type { Db } from '../../core/db/client';
import type { bcTypes } from '../../core/db/schema';
import type { AuthUser } from '../../core/env';
import { badRequest, httpError, notFound } from '../../core/errors';
import { envelope, type PageQuery } from '../../core/http';
import { createAuditService } from '../audit/audit.service';
import type { BcConfig, CeisaStage, HsTariff, RefBody } from './refs.dto';
import { MASTERS, MASTER_BY_TYPE, REGISTRY_TYPE, registryRows, type MasterDef, type Row } from './masters';
import { createRefsRepository } from './refs.repository';

export const toBcConfig = (r: typeof bcTypes.$inferSelect): BcConfig => ({
  code: r.code, label: r.name, title: r.title, direction: r.directionCode, partnerKind: r.partnerKindCode, ceisaCode: r.ceisaCode, slug: r.slug,
  international: r.international, defaultOffice: r.defaultOfficeCode, approvalCode: r.approvalCode, approvalMessage: r.approvalMessage,
  duty: r.dutyTreatmentCode, sourceDoc: r.sourceDocCode, requiresGuarantee: r.requiresGuarantee,
});

/** A master row in the shape the UI consumes: `{ id, type, code, name, meta, sort }`. The id is the code (the primary key). */
const toRef = (def: MasterDef, r: Row) => ({
  id: String(r.code), type: def.type, code: String(r.code), name: String(r[def.nameKey ?? 'name']),
  meta: def.toMeta?.(r) ?? null, sort: Number(r.sort ?? 0),
});

export function createRefsService(db: Db) {
  const repo = createRefsRepository(db);
  const audit = createAuditService(db);

  const master = (type: string) => {
    const def = MASTER_BY_TYPE.get(type);
    if (!def) throw notFound(`Tipe referensi "${type}"`);
    return def;
  };
  const editable = (type: string) => {
    const def = master(type);
    if (!def.editable) throw httpError(403, 'Referensi ini dikelola sistem dan tidak dapat diubah');
    return def;
  };

  /** Throws 400 unless every non-empty code exists in master `type` (readable message instead of an FK error). */
  async function assertCodes(type: string, codes: (string | null | undefined)[], label: string) {
    const wanted = [...new Set(codes.filter((c): c is string => !!c))];
    const found = await repo.existing(master(type), wanted);
    const missing = wanted.find((c) => !found.has(c));
    if (missing) throw badRequest(`${label} "${missing}" tidak terdaftar di master referensi`);
  }

  /** Columns to write for a reference form: name, sort, the type's own columns, and derived defaults. */
  async function columnsFor(def: MasterDef, b: RefBody) {
    const row: Row = { [def.nameKey ?? 'name']: b.name, ...(b.sort !== undefined ? { sort: b.sort } : {}), ...def.derive?.(b.code), ...def.fromMeta?.(b.meta) };
    for (const c of def.checks ?? []) await assertCodes(c.master, [row[c.column]], c.label);
    return row;
  }

  return {
    async list(type: string, p: PageQuery) {
      const def = master(type);
      const page = envelope(await repo.list(def, p), p);
      return { ...page, data: (page.data as Row[]).map((r) => toRef(def, r)) };
    },
    async create(actor: AuthUser, type: string, b: RefBody) {
      const def = editable(type);
      const row = await repo.insert(def, { code: b.code, sort: 0, ...(await columnsFor(def, b)) });
      await audit.log(actor, { action: 'create', entity: `ref_${type}`, data: { code: b.code } });
      return toRef(def, row);
    },
    async update(actor: AuthUser, type: string, code: string, b: RefBody) {
      const def = editable(type);
      if (b.code !== code) throw badRequest('Kode tidak dapat diubah');
      const row = await repo.update(def, code, await columnsFor(def, b));
      if (!row) throw notFound('Referensi');
      await audit.log(actor, { action: 'update', entity: `ref_${type}`, data: { code } });
      return toRef(def, row);
    },
    async remove(actor: AuthUser, type: string, code: string) {
      const def = editable(type);
      if (!(await repo.remove(def, code))) throw notFound('Referensi');
      await audit.log(actor, { action: 'delete', entity: `ref_${type}`, data: { code } });
    },

    assertCodes,
    /** Throws 400 unless `code` exists in master `type`. */
    assertCode: (type: string, code: string | null | undefined, label: string) => assertCodes(type, [code], label),

    async bcConfig(code: string): Promise<BcConfig> {
      const r = await repo.bcType(code);
      if (!r) throw badRequest(`Jenis BC "${code}" tidak terdaftar`);
      return toBcConfig(r);
    },
    async bcConfigs(): Promise<BcConfig[]> {
      return (await repo.bcTypes()).map(toBcConfig);
    },
    async direction(code: string) {
      const r = await repo.direction(code);
      if (!r) throw httpError(500, `Arah dokumen "${code}" tidak terdaftar`);
      return { sign: r.sign, partyLabel: r.partyLabel, shortLabel: r.shortLabel, tone: r.tone, countryIsOrigin: r.countryIsOrigin, countryLabel: r.countryLabel };
    },
    async duty(code: string) {
      const r = await repo.dutyTreatment(code);
      if (!r) throw httpError(500, `Perlakuan pungutan "${code}" tidak terdaftar`);
      return { code: r.code, label: r.name, charged: r.charged };
    },
    /** Codes of stock sources having a flag. */
    movementSources: (flag: 'fromDocument' | 'adjustment') => repo.stockSourceCodes(flag === 'adjustment' ? 'isAdjustment' : 'fromDocument'),
    async ceisaStages(): Promise<CeisaStage[]> {
      return (await repo.ceisaStages()).map((r) => ({ code: r.code, message: r.message, status: r.statusCode, afterSec: r.afterSec }));
    },
    /** Tariffs keyed by HS digits only. */
    async hsTariffs(): Promise<Map<string, HsTariff>> {
      return new Map((await repo.hsCodes()).map((r) => [r.code.replace(/\D/g, ''), { code: r.code, bm: Number(r.bmRate), ppn: Number(r.ppnRate), pph: Number(r.pphRate) }]));
    },
    /** Mock INSW lookup. */
    async insw(hs: string) {
      const r = await repo.findHs(hs.replace(/\D/g, ''));
      if (!r) throw notFound(`HS ${hs}`);
      return { kodeHs: r.code, uraian: r.name, bm: Number(r.bmRate), ppn: Number(r.ppnRate), pph: Number(r.pphRate), sumber: 'INSW (mock)' };
    },

    /** Every master as `{ [type]: rows }` for the UI (`/meta`), including the registry of lists itself. */
    async allForMeta() {
      const entries = await Promise.all(MASTERS.map(async (def) => [def.type, (await repo.all(def)).map((r) => toRef(def, r))] as const));
      return { [REGISTRY_TYPE]: registryRows(), ...Object.fromEntries(entries) };
    },
  };
}
export type RefsService = ReturnType<typeof createRefsService>;
