import { sql } from 'drizzle-orm';
import {
  pgTable, serial, integer, smallint, text, varchar, numeric, timestamp, date, boolean, check, uniqueIndex, index,
} from 'drizzle-orm/pg-core';

// Pure relational schema: no JSON columns, no enums, no generic key/type tables.
//  - Every lookup (country, port, currency, BC type, role, status…) is its own master table keyed by a short code.
//  - Every coded column is a real foreign key, so the database itself rejects unknown codes.
//  - Behaviour (permissions, document lifecycle, stock sign, duty treatment…) is stored as boolean/number columns
//    on the master rows, so a new role/status/BC type is plain data: no migration, no code change.
//  - Lists inside a document (lines, containers, supporting documents, guarantee) are child tables.

/** Common columns of a code-keyed master table. */
const master = (codeLength: number) => ({
  code: varchar('code', { length: codeLength }).primaryKey(),
  name: text('name').notNull(),
  sort: integer('sort').notNull().default(0),
});

// ───────────────────────────── Access control & document lifecycle ─────────────────────────────

export const roles = pgTable('roles', {
  code: varchar('code', { length: 20 }).primaryKey(),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  tone: varchar('tone', { length: 10 }).notNull().default('gray'),
  canWrite: boolean('can_write').notNull().default(false),
  isAdmin: boolean('is_admin').notNull().default(false),
  sort: integer('sort').notNull().default(0),
});

export const documentStatuses = pgTable('document_statuses', {
  code: varchar('code', { length: 20 }).primaryKey(),
  name: text('name').notNull(),
  tone: varchar('tone', { length: 10 }).notNull().default('gray'),
  initial: boolean('initial').notNull().default(false), // status of a new / edited document
  editable: boolean('editable').notNull().default(false), // may be edited, deleted, (re)submitted
  inFlight: boolean('in_flight').notNull().default(false), // waiting for CEISA
  registered: boolean('registered').notNull().default(false), // registration number has been issued
  approved: boolean('approved').notNull().default(false), // final approval: stock is booked
  rejected: boolean('rejected').notNull().default(false), // final rejection
  sort: integer('sort').notNull().default(0),
}, (t) => [uniqueIndex('document_statuses_one_initial').on(t.initial).where(sql`${t.initial}`)]);

// ───────────────────────────── Reference masters ─────────────────────────────

export const countries = pgTable('countries', master(3));
export const ports = pgTable('ports', {
  ...master(10),
  countryCode: varchar('country_code', { length: 3 }).notNull().references(() => countries.code),
});
export const units = pgTable('units', master(10));
export const packagings = pgTable('packagings', master(10));
export const currencies = pgTable('currencies', {
  ...master(3),
  rate: numeric('rate', { precision: 14, scale: 4 }).notNull().default('1'), // tax-office exchange rate (NDPBM)
});
export const customsOffices = pgTable('customs_offices', master(6));
export const incoterms = pgTable('incoterms', master(3));
export const hsCodes = pgTable('hs_codes', {
  ...master(12),
  bmRate: numeric('bm_rate', { precision: 5, scale: 2 }).notNull().default('0'),
  ppnRate: numeric('ppn_rate', { precision: 5, scale: 2 }).notNull().default('0'),
  pphRate: numeric('pph_rate', { precision: 5, scale: 2 }).notNull().default('0'),
});
export const documentTypes = pgTable('document_types', master(10));
export const transportModes = pgTable('transport_modes', {
  ...master(2),
  usesPort: boolean('uses_port').notNull().default(false),
  usesContainer: boolean('uses_container').notNull().default(false),
  usesPlate: boolean('uses_plate').notNull().default(false),
});
export const containerSizes = pgTable('container_sizes', master(6));
export const containerTypes = pgTable('container_types', master(6));
export const guaranteeTypes = pgTable('guarantee_types', master(6));

export const itemCategories = pgTable('item_categories', {
  ...master(20),
  reportTitle: text('report_title').notNull(),
  slug: varchar('slug', { length: 30 }).notNull().unique(),
});
export const partnerKinds = pgTable('partner_kinds', master(20));

/** Document direction: stock sign (+1 in / −1 out) and wording. */
export const directions = pgTable('directions', {
  ...master(10),
  sign: smallint('sign').notNull(),
  partyLabel: text('party_label').notNull(),
  shortLabel: text('short_label').notNull(),
  tone: varchar('tone', { length: 10 }).notNull().default('gray'),
  countryLabel: text('country_label').notNull(),
  countryIsOrigin: boolean('country_is_origin').notNull(), // true: the document records the origin country, false: destination
}, (t) => [check('directions_sign_chk', sql`${t.sign} in (1, -1)`)]);

export const dutyTreatments = pgTable('duty_treatments', {
  ...master(20),
  charged: boolean('charged').notNull().default(false), // duties are computed for this treatment
});

export const stockSources = pgTable('stock_sources', {
  ...master(20),
  fromDocument: boolean('from_document').notNull().default(false), // written by the BC document flow
  isAdjustment: boolean('is_adjustment').notNull().default(false), // shown as "penyesuaian" in the mutation report
});

/** Source document kinds (purchase order, commercial invoice) that BC documents are built from. */
export const sourceDocTypes = pgTable('source_doc_types', {
  ...master(20),
  slug: varchar('slug', { length: 20 }).notNull().unique(),
  partnerKindCode: varchar('partner_kind_code', { length: 20 }).notNull().references(() => partnerKinds.code),
  documentTypeCode: varchar('document_type_code', { length: 10 }).references(() => documentTypes.code),
  description: text('description').notNull().default(''),
});

/** BC document types (2.3, 2.5, 2.6.1 …): all rules the app needs per type. `name` is the short label (e.g. "BC 2.3"). */
export const bcTypes = pgTable('bc_types', {
  ...master(8),
  title: text('title').notNull(),
  directionCode: varchar('direction_code', { length: 10 }).notNull().references(() => directions.code),
  partnerKindCode: varchar('partner_kind_code', { length: 20 }).notNull().references(() => partnerKinds.code),
  ceisaCode: varchar('ceisa_code', { length: 6 }).notNull(),
  slug: varchar('slug', { length: 30 }).notNull().unique(),
  international: boolean('international').notNull().default(false),
  defaultOfficeCode: varchar('default_office_code', { length: 6 }).notNull().references(() => customsOffices.code),
  approvalCode: varchar('approval_code', { length: 10 }).notNull(),
  approvalMessage: text('approval_message').notNull(),
  dutyTreatmentCode: varchar('duty_treatment_code', { length: 20 }).notNull().references(() => dutyTreatments.code),
  sourceDocCode: varchar('source_doc_code', { length: 20 }).notNull().references(() => sourceDocTypes.code),
  requiresGuarantee: boolean('requires_guarantee').notNull().default(false),
});

/** CEISA response stages (mock host-to-host timeline). `message` is the stage's response text. */
export const ceisaStages = pgTable('ceisa_stages', {
  code: varchar('code', { length: 10 }).primaryKey(),
  message: text('message').notNull(),
  statusCode: varchar('status_code', { length: 20 }).notNull().references(() => documentStatuses.code),
  afterSec: integer('after_sec').notNull(),
  sort: integer('sort').notNull().default(0),
});

// ───────────────────────────── Users & settings ─────────────────────────────

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  email: varchar('email', { length: 120 }).notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role: varchar('role', { length: 20 }).notNull().references(() => roles.code),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/** The company (bonded zone operator): exactly one row. */
export const companyProfile = pgTable('company_profile', {
  id: integer('id').primaryKey().default(1),
  name: text('name').notNull(),
  npwp: varchar('npwp', { length: 30 }).notNull(),
  izinKb: varchar('izin_kb', { length: 30 }).notNull(),
  companyId: varchar('company_id', { length: 6 }).notNull(), // CEISA company id, part of the aju number
  address: text('address').notNull(),
  city: text('city').notNull(),
  timezone: varchar('timezone', { length: 40 }).notNull(), // IANA; business dates (aju, registration, stock)
  signatoryName: text('signatory_name').notNull(),
  signatoryTitle: text('signatory_title').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [check('company_profile_single_row', sql`${t.id} = 1`)]);

/** Application branding and login-page content: exactly one row. */
export const appSettings = pgTable('app_settings', {
  id: integer('id').primaryKey().default(1),
  name: text('name').notNull(),
  subtitle: text('subtitle').notNull().default(''),
  tagline: text('tagline').notNull().default(''),
  description: text('description').notNull().default(''),
  environmentLabel: text('environment_label'),
  footnote: text('footnote'),
  printHeader: text('print_header').notNull().default(''),
  printFootnote: text('print_footnote'),
  demoPassword: text('demo_password'), // shown on the login page when demo accounts exist
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [check('app_settings_single_row', sql`${t.id} = 1`)]);

export const appFeatures = pgTable('app_features', {
  id: serial('id').primaryKey(),
  text: text('text').notNull(),
  sort: integer('sort').notNull().default(0),
});

/** Accounts offered on the login page (one-click demo login). */
export const demoAccounts = pgTable('demo_accounts', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().unique().references(() => users.id, { onDelete: 'cascade' }),
  label: text('label').notNull(),
  description: text('description').notNull().default(''),
  sort: integer('sort').notNull().default(0),
});

// ───────────────────────────── Business data ─────────────────────────────

export const partners = pgTable('partners', {
  id: serial('id').primaryKey(),
  kind: varchar('kind', { length: 20 }).notNull().references(() => partnerKinds.code),
  name: text('name').notNull(),
  npwp: varchar('npwp', { length: 22 }),
  address: text('address'),
  countryCode: varchar('country_code', { length: 3 }).notNull().references(() => countries.code),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('partners_kind').on(t.kind)]);

export const items = pgTable('items', {
  id: serial('id').primaryKey(),
  code: varchar('code', { length: 40 }).notNull().unique(),
  name: text('name').notNull(),
  category: varchar('category', { length: 20 }).notNull().references(() => itemCategories.code),
  hsCode: varchar('hs_code', { length: 12 }).references(() => hsCodes.code),
  uom: varchar('uom', { length: 10 }).notNull().references(() => units.code),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('items_category').on(t.category)]);

/** Purchase orders and commercial invoices: the source documents BC documents are built from. */
export const tradeDocs = pgTable('trade_docs', {
  id: serial('id').primaryKey(),
  kind: varchar('kind', { length: 20 }).notNull().references(() => sourceDocTypes.code),
  number: varchar('number', { length: 40 }).notNull(),
  date: date('date').notNull(),
  partnerId: integer('partner_id').notNull().references(() => partners.id),
  currency: varchar('currency', { length: 3 }).notNull().references(() => currencies.code),
  incoterm: varchar('incoterm', { length: 3 }).references(() => incoterms.code),
  total: numeric('total', { precision: 18, scale: 2 }).notNull().default('0'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex('trade_kind_number').on(t.kind, t.number)]);

export const tradeDocLines = pgTable('trade_doc_lines', {
  id: serial('id').primaryKey(),
  tradeDocId: integer('trade_doc_id').notNull().references(() => tradeDocs.id, { onDelete: 'cascade' }),
  itemId: integer('item_id').notNull().references(() => items.id),
  qty: numeric('qty', { precision: 18, scale: 4 }).notNull(),
  unitPrice: numeric('unit_price', { precision: 18, scale: 4 }).notNull(),
}, (t) => [index('trade_lines_doc').on(t.tradeDocId)]);

/** Every BC type in one table (`bc_type`). Transport/packing header data are plain columns; repeating data are child tables. */
export const customsDocs = pgTable('customs_docs', {
  id: serial('id').primaryKey(),
  bcType: varchar('bc_type', { length: 8 }).notNull().references(() => bcTypes.code),
  ajuNumber: varchar('aju_number', { length: 26 }).notNull().unique(),
  registrationNumber: varchar('registration_number', { length: 6 }),
  registrationDate: date('registration_date'),
  status: varchar('status', { length: 20 }).notNull().references(() => documentStatuses.code),
  partnerId: integer('partner_id').notNull().references(() => partners.id),
  tradeDocId: integer('trade_doc_id').references(() => tradeDocs.id),
  officeCode: varchar('office_code', { length: 6 }).notNull().references(() => customsOffices.code),
  currency: varchar('currency', { length: 3 }).notNull().references(() => currencies.code),
  kurs: numeric('kurs', { precision: 12, scale: 2 }).notNull(),
  totalValue: numeric('total_value', { precision: 18, scale: 2 }).notNull().default('0'),

  // transport
  transportModeCode: varchar('transport_mode_code', { length: 2 }).references(() => transportModes.code),
  carrierName: text('carrier_name'),
  voyageNumber: text('voyage_number'),
  vehiclePlate: text('vehicle_plate'),
  loadingPortCode: varchar('loading_port_code', { length: 10 }).references(() => ports.code),
  destinationPortCode: varchar('destination_port_code', { length: 10 }).references(() => ports.code),
  originCountryCode: varchar('origin_country_code', { length: 3 }).references(() => countries.code),
  destinationCountryCode: varchar('destination_country_code', { length: 3 }).references(() => countries.code),
  incotermCode: varchar('incoterm_code', { length: 3 }).references(() => incoterms.code),
  shippingPurpose: text('shipping_purpose'),
  // packing
  packageCount: integer('package_count'),
  packageTypeCode: varchar('package_type_code', { length: 10 }).references(() => packagings.code),
  grossWeight: numeric('gross_weight', { precision: 14, scale: 2 }),
  netWeight: numeric('net_weight', { precision: 14, scale: 2 }),

  // duties (IDR) computed from the line tariffs
  dutyBm: numeric('duty_bm', { precision: 20, scale: 0 }).notNull().default('0'),
  dutyPpn: numeric('duty_ppn', { precision: 20, scale: 0 }).notNull().default('0'),
  dutyPph: numeric('duty_pph', { precision: 20, scale: 0 }).notNull().default('0'),
  dutyTotal: numeric('duty_total', { precision: 20, scale: 0 }).notNull().default('0'),
  dutyTreatmentCode: varchar('duty_treatment_code', { length: 20 }).notNull().references(() => dutyTreatments.code),

  submittedAt: timestamp('submitted_at', { withTimezone: true }),
  createdBy: integer('created_by').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('customs_type_status').on(t.bcType, t.status)]);

/** Tariff rates are copied from the HS master at save time, so later tariff changes don't rewrite history. */
export const customsDocLines = pgTable('customs_doc_lines', {
  id: serial('id').primaryKey(),
  docId: integer('doc_id').notNull().references(() => customsDocs.id, { onDelete: 'cascade' }),
  itemId: integer('item_id').notNull().references(() => items.id),
  hsCode: varchar('hs_code', { length: 12 }).references(() => hsCodes.code),
  qty: numeric('qty', { precision: 18, scale: 4 }).notNull(),
  unitPrice: numeric('unit_price', { precision: 18, scale: 4 }).notNull(),
  bmRate: numeric('bm_rate', { precision: 5, scale: 2 }).notNull().default('0'),
  ppnRate: numeric('ppn_rate', { precision: 5, scale: 2 }).notNull().default('0'),
  pphRate: numeric('pph_rate', { precision: 5, scale: 2 }).notNull().default('0'),
}, (t) => [index('lines_doc').on(t.docId)]);

export const customsDocContainers = pgTable('customs_doc_containers', {
  id: serial('id').primaryKey(),
  docId: integer('doc_id').notNull().references(() => customsDocs.id, { onDelete: 'cascade' }),
  containerNumber: text('container_number').notNull(),
  sizeCode: varchar('size_code', { length: 6 }).notNull().references(() => containerSizes.code),
  typeCode: varchar('type_code', { length: 6 }).notNull().references(() => containerTypes.code),
}, (t) => [index('containers_doc').on(t.docId)]);

/** Supporting documents attached to a BC document (invoice, packing list, B/L …). */
export const customsDocDocuments = pgTable('customs_doc_documents', {
  id: serial('id').primaryKey(),
  docId: integer('doc_id').notNull().references(() => customsDocs.id, { onDelete: 'cascade' }),
  documentTypeCode: varchar('document_type_code', { length: 10 }).notNull().references(() => documentTypes.code),
  number: text('number').notNull(),
  documentDate: date('document_date'),
}, (t) => [index('supporting_docs_doc').on(t.docId)]);

/** At most one guarantee per document (required by BC types flagged `requires_guarantee`). */
export const customsDocGuarantees = pgTable('customs_doc_guarantees', {
  docId: integer('doc_id').primaryKey().references(() => customsDocs.id, { onDelete: 'cascade' }),
  guaranteeTypeCode: varchar('guarantee_type_code', { length: 6 }).references(() => guaranteeTypes.code),
  number: text('number'),
  guarantor: text('guarantor'),
  amount: numeric('amount', { precision: 20, scale: 0 }),
  dueDate: date('due_date'),
});

/** CEISA response history per document (mock host-to-host). */
export const customsDocEvents = pgTable('customs_doc_events', {
  id: serial('id').primaryKey(),
  docId: integer('doc_id').notNull().references(() => customsDocs.id, { onDelete: 'cascade' }),
  status: varchar('status', { length: 20 }).notNull().references(() => documentStatuses.code),
  code: varchar('code', { length: 10 }).notNull(), // response code (100, 110, 200, SPPB, NPE, 900 …)
  message: text('message').notNull(),
  registrationNumber: varchar('registration_number', { length: 6 }), // present once a registration number has been issued
  registrationDate: date('registration_date'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex('events_doc_code').on(t.docId, t.code)]);

/** Stock ledger: +qty in, −qty out. Mutation reports and stock are aggregated from here. */
export const stockMovements = pgTable('stock_movements', {
  id: serial('id').primaryKey(),
  itemId: integer('item_id').notNull().references(() => items.id),
  docId: integer('doc_id').references(() => customsDocs.id, { onDelete: 'cascade' }),
  source: varchar('source', { length: 20 }).notNull().references(() => stockSources.code),
  qty: numeric('qty', { precision: 18, scale: 4 }).notNull(),
  date: date('date').notNull(),
  note: text('note'),
}, (t) => [index('moves_item_date').on(t.itemId, t.date)]);

/** User activity. `refKey`/`refValue` hold the one attribute that identifies the subject (code, aju, email …). */
export const auditLogs = pgTable('audit_logs', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id, { onDelete: 'set null' }),
  action: varchar('action', { length: 40 }).notNull(),
  entity: varchar('entity', { length: 40 }).notNull(),
  entityId: integer('entity_id'),
  refKey: varchar('ref_key', { length: 30 }),
  refValue: text('ref_value'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type Role = typeof roles.$inferSelect;
export type DocumentStatus = typeof documentStatuses.$inferSelect;
