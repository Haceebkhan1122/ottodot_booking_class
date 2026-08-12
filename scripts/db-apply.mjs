/**
 * Applies db/001_schema.sql then db/002_seed.sql.
 *
 * Shared by `npm run db:reset`, the local Postgres launcher, and the test
 * setup, so all three provably start from the same state - a reviewer running
 * the demo and CI running the suite see identical fixtures.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import postgres from 'postgres';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const FILES = ['001_schema.sql', '002_seed.sql'];

export async function applySchemaAndSeed(databaseUrl, { quiet = false } = {}) {
  const sql = postgres(databaseUrl, { max: 1, onnotice: () => {} });

  try {
    for (const file of FILES) {
      const text = readFileSync(path.join(ROOT, 'db', file), 'utf8');
      // `sql.unsafe` because these are our own migration files, not input.
      // Splitting them into statements ourselves would break on the `$$` bodies
      // and the semicolons inside string literals.
      await sql.unsafe(text);
      if (!quiet) console.log(`  applied db/${file}`);
    }

    const [{ classes, students, bookings }] = await sql`
      select
        (select count(*) from trial_classes) as classes,
        (select count(*) from students)      as students,
        (select count(*) from bookings)      as bookings
    `;

    if (!quiet) {
      console.log(`  seeded ${classes} classes, ${students} students, ${bookings} bookings`);
    }
  } finally {
    await sql.end({ timeout: 5 });
  }
}
