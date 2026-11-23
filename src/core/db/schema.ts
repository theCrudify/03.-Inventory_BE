import {
  pgTable, serial, integer, text, varchar, numeric, timestamp, date, jsonb, uniqueIndex, index,
} from 'drizzle-orm/pg-core';

// No database enums: every coded column is a varchar holding a `refs` code (noted per column),
// validated by the services. Behaviour attached to a code (permissions, document lifecycle,
// stock sign…) is read from that ref's `meta`, so new codes need no migration.

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  email: varchar('email', { length: 120 }).notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role: varchar('role', { length: 20 }).notNull(), // refs: role
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Company profile and app settings, one JSON document per key. */
export const settings = pgTable('settings', {
  key: varchar('key', { length: 40 }).primaryKey(),
  value: jsonb('value').$type<Record<string, unknown>>().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Every master/lookup list in one table, keyed by `type`. Includes the registry of types itself
 * (`tipe_referensi`), BC document types, statuses, CEISA stages, categories, countries, HS tariffs…
 */
export const refs = pgTable('refs', {
  id: serial('id').primaryKey(),
  type: varchar('type', { length: 30 }).notNull(),
  code: varchar('code', { length: 30 }).notNull(),
  name: text('name').notNull(),
  meta: jsonb('meta').$type<Record<string, unknown>>(),
  sort: integer('sort').notNull().default(0),
}, (t) => [uniqueIndex('refs_type_code').on(t.type, t.code)]);

export const partners = pgTable('partners', {
  id: serial('id').primaryKey(),
  kind: varchar('kind', { length: 20 }).notNull(), // refs: jenis_mitra
  name: text('name').notNull(),
  npwp: varchar('npwp', { length: 22 }),
  address: text('address'),
  countryCode: varchar('country_code', { length: 3 }).notNull(), // refs: negara
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('partners_kind').on(t.kind)]);

export const items = pgTable('items', {
  id: serial('id').primaryKey(),
  code: varchar('code', { length: 40 }).notNull().unique(),
  name: text('name').notNull(),
  category: varchar('category', { length: 20 }).notNull(), // refs: kategori_barang
  hsCode: varchar('hs_code', { length: 12 }), // refs: hs
  uom: varchar('uom', { length: 10 }).notNull(), // refs: satuan
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('items_category').on(t.category)]);

/** Purchase orders and commercial invoices: the source documents BC documents are built from. */
export const tradeDocs = pgTable('trade_docs', {
  id: serial('id').primaryKey(),
  kind: varchar('kind', { length: 20 }).notNull(), // refs: jenis_sumber
  number: varchar('number', { length: 40 }).notNull(),
  date: date('date').notNull(),
  partnerId: integer('partner_id').notNull().references(() => partners.id),
  currency: varchar('currency', { length: 3 }).notNull(),
  incoterm: varchar('incoterm', { length: 3 }),
  lines: jsonb('lines').$type<TradeLine[]>().notNull().default([]),
  total: numeric('total', { precision: 18, scale: 2 }).notNull().default('0'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex('trade_kind_number').on(t.kind, t.number)]);

/** Every BC type in one table (`bc_type` = refs jenis_bc). Type-specific header fields live in `header`. */
export const customsDocs = pgTable('customs_docs', {
  id: serial('id').primaryKey(),
  bcType: varchar('bc_type', { length: 8 }).notNull(),
  ajuNumber: varchar('aju_number', { length: 26 }).notNull().unique(),
  registrationNumber: varchar('registration_number', { length: 6 }),
  registrationDate: date('registration_date'),
  status: varchar('status', { length: 20 }).notNull(), // refs: status_dokumen
  partnerId: integer('partner_id').notNull().references(() => partners.id),
  tradeDocId: integer('trade_doc_id').references(() => tradeDocs.id),
  officeCode: varchar('office_code', { length: 6 }).notNull(),
  currency: varchar('currency', { length: 3 }).notNull(),
  kurs: numeric('kurs', { precision: 12, scale: 2 }).notNull(),
  totalValue: numeric('total_value', { precision: 18, scale: 2 }).notNull().default('0'),
  header: jsonb('header').$type<Record<string, unknown>>().notNull().default({}),
  duties: jsonb('duties').$type<Duties>(),
  submittedAt: timestamp('submitted_at', { withTimezone: true }),
  createdBy: integer('created_by').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('customs_type_status').on(t.bcType, t.status)]);

/** Tariff rates are copied from the HS reference at save time, so later tariff changes don't rewrite history. */
export const customsDocLines = pgTable('customs_doc_lines', {
  id: serial('id').primaryKey(),
  docId: integer('doc_id').notNull().references(() => customsDocs.id, { onDelete: 'cascade' }),
  itemId: integer('item_id').notNull().references(() => items.id),
  hsCode: varchar('hs_code', { length: 12 }),
  qty: numeric('qty', { precision: 18, scale: 4 }).notNull(),
  unitPrice: numeric('unit_price', { precision: 18, scale: 4 }).notNull(),
  bmRate: numeric('bm_rate', { precision: 5, scale: 2 }).notNull().default('0'),
  ppnRate: numeric('ppn_rate', { precision: 5, scale: 2 }).notNull().default('0'),
  pphRate: numeric('pph_rate', { precision: 5, scale: 2 }).notNull().default('0'),
}, (t) => [index('lines_doc').on(t.docId)]);

/** CEISA response history per document (mock host-to-host). */
export const customsDocEvents = pgTable('customs_doc_events', {
  id: serial('id').primaryKey(),
  docId: integer('doc_id').notNull().references(() => customsDocs.id, { onDelete: 'cascade' }),
  status: varchar('status', { length: 20 }).notNull(), // refs: status_dokumen
  code: varchar('code', { length: 10 }).notNull(),
  message: text('message').notNull(),
  payload: jsonb('payload').$type<Record<string, unknown>>(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex('events_doc_code').on(t.docId, t.code)]);

/** Stock ledger: +qty in, -qty out. Mutation reports and stock are aggregated from here. */
export const stockMovements = pgTable('stock_movements', {
  id: serial('id').primaryKey(),
  itemId: integer('item_id').notNull().references(() => items.id),
  docId: integer('doc_id').references(() => customsDocs.id, { onDelete: 'cascade' }),
  source: varchar('source', { length: 20 }).notNull(), // refs: sumber_mutasi
  qty: numeric('qty', { precision: 18, scale: 4 }).notNull(),
  date: date('date').notNull(),
  note: text('note'),
}, (t) => [index('moves_item_date').on(t.itemId, t.date)]);

export const auditLogs = pgTable('audit_logs', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id, { onDelete: 'set null' }),
  action: varchar('action', { length: 40 }).notNull(),
  entity: varchar('entity', { length: 40 }).notNull(),
  entityId: integer('entity_id'),
  data: jsonb('data').$type<Record<string, unknown>>(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type TradeLine = { itemId: number; qty: number; unitPrice: number };
export type Duties = { bm: number; ppn: number; pph: number; total: number; treatment: string };
export type Ref = typeof refs.$inferSelect;
