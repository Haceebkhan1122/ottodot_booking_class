#!/usr/bin/env node
/**
 * Start a real PostgreSQL server with no Docker and no system install.
 *
 * `embedded-postgres` downloads the official Postgres binaries on first run and
 * launches an actual server process. This matters: it is a genuine server on a
 * real TCP port, so connections are genuinely concurrent and row locks are
 * genuinely contended. An in-process or single-connection substitute would make
 * the concurrency tests pass without proving anything - the same reason SQLite
 * was rejected.
 *
 * Docker remains the documented path (`docker compose up -d --wait`). This
 * exists so a reviewer without Docker is never blocked.
 *
 *   node scripts/db-local.mjs          start, seed, and stay running
 *   node scripts/db-local.mjs --stop   stop and delete the data directory
 */
import EmbeddedPostgres from 'embedded-postgres';
import { existsSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { applySchemaAndSeed } from './db-apply.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
/*
 * Under node_modules/.cache, not the project root.
 *
 * Postgres writes to its data directory constantly, and Next.js dev watches
 * the project for source changes. With the data directory inside the repo the
 * watcher recompiled in a loop and would intermittently read a half-written
 * build manifest, producing a 500 with a JSON parse error on an unrelated
 * request. node_modules is already ignored by every watcher involved.
 */
const DATA_DIR =
  process.env.LOCAL_PG_DATA_DIR ??
  path.join(ROOT, 'node_modules', '.cache', 'ottodot-pgdata');

const PORT = Number(process.env.LOCAL_PG_PORT ?? 5432);
const USER = 'postgres';
const PASSWORD = 'postgres';
const DATABASE = 'ottodot';
const URL = `postgresql://${USER}:${PASSWORD}@localhost:${PORT}/${DATABASE}`;

if (process.argv.includes('--stop')) {
  rmSync(DATA_DIR, { recursive: true, force: true });
  console.log(`Removed ${DATA_DIR}. Any running server was started in the foreground - stop it with Ctrl+C.`);
  process.exit(0);
}

const pg = new EmbeddedPostgres({
  databaseDir: DATA_DIR,
  user: USER,
  password: PASSWORD,
  port: PORT,
  persistent: true,
  onLog: () => {},
  onError: () => {},
});

const firstRun = !existsSync(DATA_DIR);

if (firstRun) {
  console.log('Initialising a local Postgres data directory (first run only)...');
  await pg.initialise();
}

console.log(`Starting Postgres on port ${PORT}...`);
await pg.start();

// createDatabase throws if it already exists, which is fine on a restart.
await pg.createDatabase(DATABASE).catch(() => {});

await applySchemaAndSeed(URL);

console.log(`
  Postgres is running.

    DATABASE_URL=${URL}

  Leave this terminal open and start the app in another:

    npm run dev

  Ctrl+C stops the server. Data survives a restart;
  \`npm run db:local:stop\` deletes it.
`);

const shutdown = async () => {
  console.log('\nStopping Postgres...');
  await pg.stop().catch(() => {});
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// Hold the process open; the server dies with it.
setInterval(() => {}, 1 << 30);
