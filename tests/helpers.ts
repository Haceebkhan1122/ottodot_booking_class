import { readFileSync } from 'node:fs';
import path from 'node:path';
import postgres from 'postgres';

/**
 * A pool sized well above the concurrency any test uses.
 *
 * If the pool were smaller than the number of racers, the driver would queue
 * them and the database would never see them arrive together - the test would
 * pass without ever exercising the lock it exists to test.
 */
export const sql = postgres(
  process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/ottodot',
  {
    max: 30,
    transform: postgres.camel,
    onnotice: () => {},
    // Short, so the run can exit on its own. Calling `sql.end()` from a
    // per-file afterAll does not work here: the files share one process, so
    // the first file to finish would close the pool the others still need.
    idle_timeout: 1,
  },
);

const SEED = readFileSync(path.join(process.cwd(), 'db', '002_seed.sql'), 'utf8');

/** Restores the seed. The file starts with TRUNCATE, so this is a full reset. */
export async function reseed(): Promise<void> {
  await sql.unsafe(SEED);
}

export async function classState(classId: string) {
  const [row] = await sql<{ confirmedCount: number; capacity: number }[]>`
    select confirmed_count, capacity from trial_classes where id = ${classId}
  `;
  return row;
}

export async function bookingStatus(bookingId: string) {
  const [row] = await sql<{ status: string; failureReason: string | null }[]>`
    select status, failure_reason from bookings where id = ${bookingId}
  `;
  return row;
}

export async function attemptResults(bookingId: string): Promise<string[]> {
  const rows = await sql<{ result: string }[]>`
    select result from payment_attempts where booking_id = ${bookingId} order by created_at, id
  `;
  return rows.map((r) => r.result);
}

/** How many bookings actually sit on the roster, counted from rows not counters. */
export async function confirmedRowCount(classId: string): Promise<number> {
  const [row] = await sql<{ count: string }[]>`
    select count(*) from bookings where trial_class_id = ${classId} and status = 'confirmed'
  `;
  return Number(row.count);
}

/**
 * Children the seed leaves free in Mathematics - the class the race tests use.
 *
 * Zara, Hamza and Ayesha are the three already confirmed there, so including
 * any of them would have the uniqueness rule quietly drop a racer and the
 * field would be smaller than the test claims.
 */
export const FIXTURE_STUDENTS = [
  'stu_aisha',
  'stu_bilal',
  'stu_yusuf',
  ...Array.from({ length: 8 }, (_, i) => `stu_fixture_${i + 1}`),
];

export const key = (prefix: string): string =>
  `${prefix}_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
