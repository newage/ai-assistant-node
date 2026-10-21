// Idempotent schema migration; run by Vercel as `vercel-build`. Locally: node --env-file=.env scripts/migrate.js
import { neon } from '@neondatabase/serverless';
import config from '../src/config.js';
import { readSchema } from './migrate-lib.js';

if (!config.databaseUrl) {
  console.error('DATABASE_URL is empty: cannot migrate');
  process.exit(1);
}

try {
  await neon(config.databaseUrl).query(await readSchema());
  console.log('migration done');
} catch (err) {
  console.error('migration failed:', err?.message ?? err);
  process.exit(1);
}
