import type { Db } from '../../core/db/client';
import type { customsDocs } from '../../core/db/schema';
import type { AuthUser } from '../../core/env';
import { badRequest, conflict, httpError, notFound, unprocessable } from '../../core/errors';
import { envelope } from '../../core/http';
import { createAuditService } from '../audit/audit.service';
import { createItemsRepository } from '../items/items.repository';
import { createDocumentStatusesService } from '../document-statuses/document-statuses.service';
import { createPartnersRepository } from '../partners/partners.repository';
import { createRefsService } from '../refs/refs.service';
import { createSettingsService } from '../settings/settings.service';
import { ajuNumber, businessDate, calcDuties, dueStages, registrationNumber, stagesFor, validate, type MasterStage } from './customs-docs.domain';
import { dutiesFromRow, eventView, headerCodes, headerToParts, partsToHeader } from './customs-docs.mapper';
import type { CustomsDocBody, CustomsDocListQuery } from './customs-docs.dto';
import { createCustomsDocsRepository } from './customs-docs.repository';

type Doc = typeof customsDocs.$inferSelect;

/** Labels for the master lists a document header refers to (used in validation messages). */
const HEADER_LABELS: Record<string, string> = {
  cara_angkut: 'Cara angkut', pelabuhan: 'Pelabuhan', negara: 'Negara', incoterm: 'Incoterm', kemasan: 'Kemasan',
  ukuran_kontainer: 'Ukuran kontainer', tipe_kontainer: 'Tipe kontainer', jenis_dokumen: 'Jenis dokumen', jenis_jaminan: 'Jenis jaminan',
};

/** The scalar columns clients see at the top level of a document (header/duties are rebuilt separately). */
const baseView = (d: Doc) => ({
  id: d.id, bcType: d.bcType, ajuNumber: d.ajuNumber, registrationNumber: d.registrationNumber, registrationDate: d.registrationDate,
  status: d.status, partnerId: d.partnerId, tradeDocId: d.tradeDocId, officeCode: d.officeCode, currency: d.currency, kurs: d.kurs,
  totalValue: d.totalValue, submittedAt: d.submittedAt, createdBy: d.createdBy, createdAt: d.createdAt, updatedAt: d.updatedAt,
});

export function createCustomsDocsService(db: Db) {
  const repo = createCustomsDocsRepository(db);
  const itemsRepo = createItemsRepository(db);
  const partnersRepo = createPartnersRepository(db);
  const refs = createRefsService(db);
  const statuses = createDocumentStatusesService(db);
  const settings = createSettingsService(db);
  const audit = createAuditService(db);

  async function getDoc(id: number) {
    const d = await repo.byId(id);
    if (!d) throw notFound('Dokumen BC');
    return d;
  }
  async function assertEditable(d: Doc) {
    if (!(await statuses.lifecycle()).editable.includes(d.status)) throw conflict('Dokumen yang sudah dikirim ke CEISA tidak dapat diubah');
  }

  /** CEISA stage master annotated with the reject/approve flags of the status each stage reaches. */
  async function masterStages(): Promise<MasterStage[]> {
    const [stages, life] = await Promise.all([refs.ceisaStages(), statuses.lifecycle()]);
    return stages.map((s) => ({ ...s, isReject: life.rejected.includes(s.status), isApproval: life.approved.includes(s.status) }));
  }

  /** Validate references, resolve HS + tariff per line from the HS master, and split the header into columns + child rows. */
  async function prepare(b: CustomsDocBody) {
    const bc = await refs.bcConfig(b.bcType);
    await refs.assertCode('kantor', b.officeCode, 'Kantor pabean');
    await refs.assertCode('valuta', b.currency, 'Valuta');
    const partner = await partnersRepo.byId(b.partnerId);
    if (!partner) throw badRequest('Mitra tidak ditemukan');
    if (partner.kind !== bc.partnerKind) throw badRequest(`${bc.label} membutuhkan mitra berjenis "${bc.partnerKind}"`);

    for (const k of b.header.kontainer) if (k.nomor?.trim() && (!k.ukuran || !k.tipe)) throw badRequest(`Kontainer ${k.nomor}: ukuran dan tipe wajib diisi`);
    for (const d of b.header.dokumen) if (d.nomor?.trim() && !d.jenis) throw badRequest(`Dokumen ${d.nomor}: jenis wajib diisi`);
    const parts = headerToParts(b.header);
    for (const [type, codes] of Object.entries(headerCodes(parts))) await refs.assertCodes(type, codes, HEADER_LABELS[type]);

    const [its, tariffs, duty] = await Promise.all([itemsRepo.byIds(b.lines.map((l) => l.itemId)), refs.hsTariffs(), refs.duty(bc.duty)]);
    const byId = new Map(its.map((i) => [i.id, i]));
    const lines = b.lines.map((l, i) => {
      const item = byId.get(l.itemId);
      if (!item) throw badRequest(`Barang ke-${i + 1} tidak ditemukan`);
      const wanted = l.hsCode || item.hsCode;
      const t = wanted ? tariffs.get(wanted.replace(/\D/g, '')) : undefined;
      if (wanted && !t) throw badRequest(`Barang ke-${i + 1}: HS code "${wanted}" tidak terdaftar di master HS`);
      return { itemId: l.itemId, hsCode: t?.code ?? null, qty: l.qty, unitPrice: l.unitPrice, bmRate: t?.bm ?? 0, ppnRate: t?.ppn ?? 0, pphRate: t?.pph ?? 0 };
    });
    const duties = calcDuties(duty, lines, b.kurs);
    const doc = {
      bcType: bc.code, partnerId: b.partnerId, tradeDocId: b.tradeDocId ?? null, officeCode: b.officeCode,
      currency: b.currency, kurs: String(b.kurs), updatedAt: new Date(),
      totalValue: lines.reduce((s, l) => s + l.qty * l.unitPrice, 0).toFixed(2),
      ...parts.columns,
      dutyBm: String(duties.bm), dutyPpn: String(duties.ppn), dutyPph: String(duties.pph), dutyTotal: String(duties.total), dutyTreatmentCode: duty.code,
    };
    const children = {
      lines: lines.map((l) => ({ ...l, qty: String(l.qty), unitPrice: String(l.unitPrice), bmRate: String(l.bmRate), ppnRate: String(l.ppnRate), pphRate: String(l.pphRate) })),
      containers: parts.containers, documents: parts.documents, guarantee: parts.guarantee,
    };
    return { bc, doc, children };
  }

  /** Materialise every CEISA stage that is due; book stock once an approving status is reached. */
  async function advance(doc: Doc, now = new Date()) {
    const life = await statuses.lifecycle();
    if (!doc.submittedAt || !life.inFlight.includes(doc.status)) return;
    const [bc, master, lines, company] = await Promise.all([refs.bcConfig(doc.bcType), masterStages(), repo.lines(doc.id), settings.company()]);
    const due = dueStages(stagesFor(master, bc, validate(doc.carrierName, lines)), doc.submittedAt, now);
    const last = due.at(-1);
    if (!last || last.status === doc.status) return;

    const at = (sec: number) => new Date(doc.submittedAt!.getTime() + sec * 1000);
    const regNo = registrationNumber(doc.ajuNumber);
    const regDate = businessDate(doc.submittedAt, company.timezone);
    const isRegistered = (status: string) => life.registered.includes(status);
    const registered = due.some((s) => isRegistered(s.status));

    let moves: Parameters<typeof repo.advance>[3] = [];
    if (life.approved.includes(last.status)) {
      const [{ sign }, [source]] = await Promise.all([refs.direction(bc.direction), refs.movementSources('fromDocument')]);
      if (!source) throw httpError(500, 'Master sumber_mutasi belum memiliki sumber dari dokumen (fromDocument)');
      const date = businessDate(at(last.afterSec), company.timezone);
      moves = lines.map((l) => ({ itemId: l.itemId, docId: doc.id, source, qty: String(sign * Number(l.qty)), date, note: `${bc.label} ${regNo}` }));
    }

    await repo.advance(doc,
      { status: last.status, ...(registered && { registrationNumber: regNo, registrationDate: regDate }) },
      due.map((s) => ({
        docId: doc.id, status: s.status, code: s.code, message: s.message, createdAt: at(s.afterSec),
        ...(isRegistered(s.status) && { registrationNumber: regNo, registrationDate: regDate }),
      })),
      moves);
  }

  async function advanceInFlight() {
    for (const d of await repo.byStatuses((await statuses.lifecycle()).inFlight)) await advance(d);
  }

  return {
    advance,
    advanceInFlight,

    async list(p: CustomsDocListQuery) {
      await statuses.assertCode(p.status);
      await advanceInFlight();
      return envelope(await repo.list(p), p);
    },

    async get(id: number) {
      await advance(await getDoc(id));
      const doc = await getDoc(id);
      const [partner, lines, events, type, containers, documents, guarantee, treatment] = await Promise.all([
        partnersRepo.byId(doc.partnerId), repo.linesWithItems(id), repo.events(id), refs.bcConfig(doc.bcType),
        repo.containers(id), repo.documents(id), repo.guarantee(id), repo.dutyTreatmentName(doc.dutyTreatmentCode),
      ]);
      return {
        ...baseView(doc), header: partsToHeader(doc, containers, documents, guarantee), duties: dutiesFromRow(doc, treatment),
        partner, lines, events: events.map((e) => eventView(doc.ajuNumber, e)), type,
      };
    },

    async byAju(aju: string) {
      const doc = await repo.byAju(aju);
      if (!doc) return null;
      await advance(doc);
      return { doc, events: await repo.events(doc.id) };
    },

    async create(actor: AuthUser, b: CustomsDocBody) {
      const { bc, doc, children } = await prepare(b);
      const [company, life] = await Promise.all([settings.company(), statuses.lifecycle()]);
      const ymd = businessDate(new Date(), company.timezone);
      const seq = (await repo.countOnDate(ymd, company.timezone)) + 1;
      const row = await repo.insert({ ...doc, status: life.initial, ajuNumber: ajuNumber(bc.ceisaCode, company.companyId, ymd, seq), createdBy: actor.id }, children);
      await audit.log(actor, { action: 'create', entity: `bc${bc.code}`, entityId: row.id, data: { aju: row.ajuNumber } });
      return baseView(row);
    },

    async update(actor: AuthUser, id: number, b: CustomsDocBody) {
      const current = await getDoc(id);
      await assertEditable(current);
      if (b.bcType !== current.bcType) throw badRequest('Jenis BC tidak dapat diubah');
      const [{ bc, doc, children }, life] = await Promise.all([prepare(b), statuses.lifecycle()]);
      const row = await repo.replace(id, doc, life.initial, children);
      await audit.log(actor, { action: 'update', entity: `bc${bc.code}`, entityId: id });
      return baseView(row);
    },

    async remove(actor: AuthUser, id: number) {
      const doc = await getDoc(id);
      await assertEditable(doc);
      await repo.remove(id);
      await audit.log(actor, { action: 'delete', entity: `bc${doc.bcType}`, entityId: id, data: { aju: doc.ajuNumber } });
    },

    /** Kirim ke CEISA (mock). Documents that take stock out are checked against current stock first. */
    async submit(actor: AuthUser, id: number) {
      const doc = await getDoc(id);
      await assertEditable(doc);
      const bc = await refs.bcConfig(doc.bcType);
      if ((await refs.direction(bc.direction)).sign < 0) {
        const s = await repo.shortage(id);
        if (s) throw unprocessable(`Saldo ${s.code} tidak mencukupi (butuh ${Number(s.need)}, tersedia ${Number(s.stock)})`);
      }
      const first = stagesFor(await masterStages(), bc, null)[0];
      if (!first) throw httpError(500, 'Master tahap_ceisa kosong');
      const now = new Date();
      const sent = await repo.markSubmitted(id, now, {
        status: first.status, code: first.code, message: first.message, createdAt: now,
      });
      await audit.log(actor, { action: 'submit_ceisa', entity: `bc${bc.code}`, entityId: id, data: { aju: doc.ajuNumber } });
      return baseView(sent);
    },
  };
}
export type CustomsDocsService = ReturnType<typeof createCustomsDocsService>;
