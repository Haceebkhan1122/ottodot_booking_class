#!/usr/bin/env node
/**
 * Drops everything and re-applies the schema and seed.
 *
 *   npm run db:reset
 *
 * Reads DATABASE_URL from the environment or .env.local, so the same command
 * works against Docker, the embedded local server, or a Supabase project.
 */
import { config } from 'dotenv';
import { applySchemaAndSeed } from './db-apply.mjs';

config({ path: '.env.local', quiet: true });
config({ quiet: true });

const url = process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/ottodot';

console.log(`Resetting ${url.replace(/:\/\/[^@]*@/, '://***@')}`);

try {
  await applySchemaAndSeed(url);
  console.log('Done.');
} catch (error) {
  console.error(`\nCould not reach the database.\n  ${error.message}\n`);
  console.error('Start one first:');
  console.error('  docker compose up -d --wait     (Docker)');
  console.error('  npm run db:local                (no Docker required)\n');
  process.exit(1);
}
