import 'server-only';
import postgres, { type Sql } from 'postgres';

/**
 * The single Postgres connection pool.
 *
 * The pool size is not decoration. Concurrency is the entire subject of this
 * project, and a pool of one would serialise every request at the driver -
 * making the last-seat race impossible to reproduce and the concurrency tests
 * meaningless. A pool comfortably larger than the demo's concurrency means
 * every competing parent really is inside the confirm transaction at the same
 * moment, and the database has to arbitrate rather than the client library.
 *
 * (Same trap as choosing SQLite: a stack that cannot express the race will
 * happily "pass" a test for it.)
 */
const DEFAULT_URL = 'postgresql://postgres:postgres@localhost:5432/ottodot';

export const DATABASE_URL = process.env.DATABASE_URL ?? DEFAULT_URL;

function createClient(): Sql {
  return postgres(DATABASE_URL, {
    max: 20,
    // Shortened under test so a finished run can exit instead of waiting on
    // idle sockets.
    idle_timeout: process.env.NODE_ENV === 'test' ? 1 : 20,
    connect_timeout: 10,

    /*
     * Server-side timeouts. These are not belt-and-braces - the first version
     * of this file had none, and a request that died mid-transaction left a
     * backend holding row locks forever. The next database reset blocked behind
     * it and the whole demo wedged with no error anywhere.
     *
     *   idle_in_transaction_session_timeout - the one that mattered. Postgres
     *     itself kills a transaction whose client walked away, so an aborted
     *     HTTP request can no longer strand locks.
     *   lock_timeout - fail fast instead of queueing behind a lock forever.
     *   statement_timeout - a backstop for anything that runs away.
     *
     * All three are deliberately longer than any healthy request here (the
     * slowest is a 3s mock authorisation, which happens outside the
     * transaction) and far shorter than a person's patience.
     */
    connection: {
      statement_timeout: 15_000,
      lock_timeout: 5_000,
      idle_in_transaction_session_timeout: 10_000,
    },

    // Return snake_case columns as camelCase so the row shapes match the
    // domain types without a mapping layer on every query.
    transform: postgres.camel,

    // postgres.js logs a notice for things like "table does not exist" during
    // a reset. Those are expected; genuine failures still throw.
    onnotice: () => {},
  });
}

/**
 * Next.js reloads modules on every edit in development, and a fresh pool per
 * reload leaks connections until Postgres refuses new ones. Pinning it to
 * globalThis keeps exactly one pool alive for the process.
 */
const POOL_KEY = Symbol.for('ottodot.trialBooking.pgPool');
type GlobalWithPool = typeof globalThis & { [POOL_KEY]?: Sql };
const globalForDb = globalThis as GlobalWithPool;

export const sql: Sql = globalForDb[POOL_KEY] ?? createClient();

if (process.env.NODE_ENV !== 'production') {
  globalForDb[POOL_KEY] = sql;
}

/**
 * Postgres error codes we translate into domain failures.
 * Anything not listed here is a genuine bug and is allowed to surface.
 */
export const PG_ERROR = {
  /** unique_violation - hit by the partial unique index and idempotency key. */
  UNIQUE_VIOLATION: '23505',
  /** check_violation - hit by capacity_never_exceeded, which should be unreachable. */
  CHECK_VIOLATION: '23514',
  /** foreign_key_violation. */
  FOREIGN_KEY_VIOLATION: '23503',
} as const;

export function isPgError(error: unknown, code: string): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === code
  );
}

/** Reads the constraint name off a Postgres error, to tell two 23505s apart. */
export function pgConstraint(error: unknown): string | null {
  if (typeof error !== 'object' || error === null) return null;
  const name = (error as { constraint_name?: unknown }).constraint_name;
  return typeof name === 'string' ? name : null;
}
