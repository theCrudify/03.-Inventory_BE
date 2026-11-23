import { and, asc, eq, getTableColumns, inArray, sql } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import type { Db } from '../../core/db/client';
import * as s from '../../core/db/schema';
import { orderByFor, searchSql, toLimit, type PageQuery } from '../../core/http';
import type { MasterDef, Row } from './masters';

// Generic access to any master table (addressed through its MasterDef) plus typed readers for the
// tables whose columns drive application rules. Columns of heterogeneous tables are looked up by name.
const col = (def: MasterDef, name: string) => (def.table as unknown as Record<string, AnyPgColumn>)[name];
const codeCol = (def: MasterDef) => col(def, 'code');
const nameCol = (def: MasterDef) => col(def, def.nameKey ?? 'name');
const sortCol = (def: MasterDef) => col(def, 'sort');

export const createRefsRepository = (db: Db) => ({
  list: (def: MasterDef, p: PageQuery) => {
    const search = searchSql(p.q, [codeCol(def), nameCol(def)]);
    const order = orderByFor({ code: codeCol(def), name: nameCol(def), sort: sortCol(def) }, p.sortBy, p.sortDir, [asc(sortCol(def)), asc(codeCol(def))]);
    return db.select({ ...getTableColumns(def.table), total: sql<number>`count(*) over()`.mapWith(Number) } as never)
      .from(def.table).where(and(search)).orderBy(...order).limit(toLimit(p).limit).offset(toLimit(p).offset) as unknown as Promise<(Row & { total: number })[]>;
  },
  all: (def: MasterDef) => db.select().from(def.table).orderBy(asc(sortCol(def)), asc(codeCol(def))) as unknown as Promise<Row[]>,
  find: async (def: MasterDef, code: string) => (await db.select().from(def.table).where(eq(codeCol(def), code)))[0] as Row | undefined,
  /** Which of `codes` exist in the master (for friendly foreign-key validation). */
  existing: async (def: MasterDef, codes: string[]) => {
    if (!codes.length) return new Set<string>();
    const rows = await db.select({ code: codeCol(def) }).from(def.table).where(inArray(codeCol(def), codes));
    return new Set(rows.map((r) => String(r.code)));
  },
  insert: async (def: MasterDef, row: Row) => (await db.insert(def.table).values(row).returning())[0] as Row,
  update: async (def: MasterDef, code: string, row: Row) => (await db.update(def.table).set(row).where(eq(codeCol(def), code)).returning())[0] as Row | undefined,
  remove: async (def: MasterDef, code: string) => (await db.delete(def.table).where(eq(codeCol(def), code)).returning())[0] as Row | undefined,

  // ── typed readers for rule-bearing masters ──
  bcTypes: () => db.select().from(s.bcTypes).orderBy(asc(s.bcTypes.sort), asc(s.bcTypes.code)),
  bcType: async (code: string) => (await db.select().from(s.bcTypes).where(eq(s.bcTypes.code, code)))[0],
  direction: async (code: string) => (await db.select().from(s.directions).where(eq(s.directions.code, code)))[0],
  dutyTreatment: async (code: string) => (await db.select().from(s.dutyTreatments).where(eq(s.dutyTreatments.code, code)))[0],
  stockSourceCodes: async (flag: 'fromDocument' | 'isAdjustment') =>
    (await db.select({ code: s.stockSources.code }).from(s.stockSources).where(eq(s.stockSources[flag], true))).map((r) => r.code),
  ceisaStages: () => db.select().from(s.ceisaStages).orderBy(asc(s.ceisaStages.afterSec), asc(s.ceisaStages.sort)),
  hsCodes: () => db.select().from(s.hsCodes),
  /** HS codes are stored dotted (5208.52.00); lookups accept any punctuation. */
  findHs: async (digits: string) => (await db.select().from(s.hsCodes).where(sql`replace(${s.hsCodes.code}, '.', '') = ${digits}`))[0],
});
export type RefsRepository = ReturnType<typeof createRefsRepository>;
