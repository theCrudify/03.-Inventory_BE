import type { Db } from '../../core/db/client';
import type { Ref } from '../../core/db/schema';
import type { AuthUser } from '../../core/env';
import { badRequest, httpError, notFound } from '../../core/errors';
import { envelope, type PageQuery } from '../../core/http';
import { createAuditService } from '../audit/audit.service';
import {
  bcTypeMeta, ceisaStageMeta, directionMeta, dutyMeta, hsTariffMeta, movementSourceMeta, refTypeMeta, roleMeta, statusMeta,
  type BcConfig, type CeisaStage, type DocStatus, type HsTariff, type RefBody,
} from './refs.dto';
import { createRefsRepository } from './refs.repository';

export const REF_REGISTRY = 'tipe_referensi';

export const toBcConfig = (r: Ref): BcConfig => ({ code: r.code, label: r.name, ...bcTypeMeta.parse(r.meta) });

export function createRefsService(db: Db) {
  const repo = createRefsRepository(db);
  const audit = createAuditService(db);

  async function typeMeta(type: string) {
    const t = await repo.find(REF_REGISTRY, type);
    if (!t) throw notFound(`Tipe referensi "${type}"`);
    return refTypeMeta.parse(t.meta ?? {});
  }
  async function assertEditable(type: string) {
    if (!(await typeMeta(type)).editable) throw httpError(403, 'Referensi ini dikelola sistem dan tidak dapat diubah');
  }

  return {
    async list(type: string, p: PageQuery) {
      await typeMeta(type);
      return envelope(await repo.list(type, p), p);
    },
    async create(actor: AuthUser, type: string, b: RefBody) {
      await assertEditable(type);
      const row = await repo.insert({ type, ...b });
      await audit.log(actor, { action: 'create', entity: `ref_${type}`, entityId: row.id, data: { code: row.code } });
      return row;
    },
    async update(actor: AuthUser, type: string, id: number, b: RefBody) {
      await assertEditable(type);
      const row = await repo.update(type, id, b);
      if (!row) throw notFound('Referensi');
      await audit.log(actor, { action: 'update', entity: `ref_${type}`, entityId: id });
      return row;
    },
    async remove(actor: AuthUser, type: string, id: number) {
      await assertEditable(type);
      const row = await repo.remove(type, id);
      if (!row) throw notFound('Referensi');
      await audit.log(actor, { action: 'delete', entity: `ref_${type}`, entityId: id, data: { code: row.code } });
    },

    /** Throws 400 unless `code` exists in reference list `type`. */
    async assertCode(type: string, code: string | null | undefined, label: string) {
      if (code && !(await repo.find(type, code))) throw badRequest(`${label} "${code}" tidak terdaftar di master referensi`);
    },
    async bcConfig(code: string): Promise<BcConfig> {
      const r = await repo.find('jenis_bc', code);
      if (!r) throw badRequest(`Jenis BC "${code}" tidak terdaftar`);
      return toBcConfig(r);
    },
    async bcConfigs(): Promise<BcConfig[]> {
      return (await repo.byType('jenis_bc')).map(toBcConfig);
    },
    /** Document lifecycle derived from `status_dokumen` flags. */
    async lifecycle() {
      const all: DocStatus[] = (await repo.byType('status_dokumen')).map((r) => ({ code: r.code, label: r.name, ...statusMeta.parse(r.meta ?? {}) }));
      const codes = (f: keyof DocStatus) => all.filter((s) => s[f]).map((s) => s.code);
      const initial = codes('initial')[0];
      if (!initial) throw httpError(500, 'Master status_dokumen belum memiliki status awal (initial)');
      return { all, initial, editable: codes('editable'), inFlight: codes('inFlight'), registered: codes('registered'), approved: codes('approved'), rejected: codes('rejected') };
    },
    async role(code: string) {
      const r = await repo.find('role', code);
      if (!r) throw badRequest(`Role "${code}" tidak terdaftar`);
      return roleMeta.parse(r.meta ?? {});
    },
    async direction(code: string) {
      const r = await repo.find('arah_dokumen', code);
      if (!r) throw httpError(500, `Arah dokumen "${code}" tidak terdaftar`);
      return directionMeta.parse(r.meta);
    },
    async duty(code: string) {
      const r = await repo.find('perlakuan_pungutan', code);
      if (!r) throw httpError(500, `Perlakuan pungutan "${code}" tidak terdaftar`);
      return { code: r.code, label: r.name, ...dutyMeta.parse(r.meta ?? {}) };
    },
    /** Codes of `sumber_mutasi` having a flag. */
    async movementSources(flag: 'fromDocument' | 'adjustment') {
      return (await repo.byType('sumber_mutasi')).filter((r) => movementSourceMeta.parse(r.meta ?? {})[flag]).map((r) => r.code);
    },
    async ceisaStages(): Promise<CeisaStage[]> {
      return (await repo.byType('tahap_ceisa')).map((r) => ({ code: r.code, message: r.name, ...ceisaStageMeta.parse(r.meta) }));
    },
    /** Tariffs keyed by HS digits only. */
    async hsTariffs(): Promise<Map<string, HsTariff>> {
      return new Map((await repo.byType('hs')).map((r) => [r.code.replace(/\D/g, ''), hsTariffMeta.parse(r.meta)]));
    },
    /** Mock INSW lookup. */
    async insw(hs: string) {
      const r = await repo.findHs(hs.replace(/\D/g, ''));
      if (!r) throw notFound(`HS ${hs}`);
      return { kodeHs: r.code, uraian: r.name, ...hsTariffMeta.parse(r.meta), sumber: 'INSW (mock)' };
    },
    byTypes: repo.byTypes,
  };
}
export type RefsService = ReturnType<typeof createRefsService>;
