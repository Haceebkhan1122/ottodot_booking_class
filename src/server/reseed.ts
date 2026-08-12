import 'server-only';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { sql } from './db';

/**
 * Re-applies db/002_seed.sql, which begins with a TRUNCATE.
 *
 * Deliberately NOT the schema file. The first version re-ran 001_schema.sql
 * too, and its `drop table ... cascade` needs an ACCESS EXCLUSIVE lock on
 * every table. One request that died mid-transaction was enough to hold a lock
 * that the DROP then waited on indefinitely, and the whole demo wedged with no
 * error surfaced anywhere. TRUNCATE needs the same lock class but for a
 * moment, and `lock_timeout` on the pool now turns a wait into a clear error
 * instead of a hang.
 *
 * Schema changes belong to `npm run db:reset`, which runs against an idle
 * database rather than a live one.
 *
 * The seed is read from the same file the CLI and the tests use, rather than
 * duplicated into TypeScript. A second copy of the fixtures would drift, and
 * then "it works in the tests" would stop meaning anything about the demo.
 */
export async function reseedDatabase(): Promise<void> {
  const seed = await readFile(path.join(process.cwd(), 'db', '002_seed.sql'), 'utf8');
  await sql.unsafe(seed);
}
