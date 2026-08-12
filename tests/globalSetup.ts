import { config } from 'dotenv';

/**
 * Point the suite at a database and fail loudly if there is not one.
 *
 * These tests deliberately have no fake. The whole point is to exercise real
 * row locks under real concurrent connections, so a missing database is a
 * reason to stop, not a reason to fall back to something that would pass
 * without proving anything.
 */
export default async function setup() {
  config({ path: '.env.local', quiet: true });
  config({ quiet: true });

  process.env.DATABASE_URL ??= 'postgresql://postgres:postgres@localhost:5432/ottodot';

  const { default: postgres } = await import('postgres');
  const sql = postgres(process.env.DATABASE_URL, { max: 1, onnotice: () => {} });

  try {
    await sql`select 1`;
  } catch (error) {
    throw new Error(
      `Cannot reach Postgres at ${process.env.DATABASE_URL}.\n\n` +
        'Start one first:\n' +
        '  docker compose up -d --wait     (Docker)\n' +
        '  npm run db:local                (no Docker required)\n\n' +
        `Original error: ${(error as Error).message}`,
    );
  } finally {
    await sql.end({ timeout: 5 });
  }
}
