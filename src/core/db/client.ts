import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from './schema';

// Workers can't share sockets between requests, so each request gets its own 1-connection client.
export function createDb(url: string) {
  const sql = postgres(url, { max: 1, fetch_types: false, prepare: false });
  return { db: drizzle(sql, { schema }), close: () => sql.end({ timeout: 1 }) };
}
export type Db = ReturnType<typeof createDb>['db'];
