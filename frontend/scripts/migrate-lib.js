// Helper for migrate.js: reads the schema file so it can be tested without a database.
import { readFile } from 'node:fs/promises';

export const SCHEMA_PATH = new URL('./schema.sql', import.meta.url);

export async function readSchema(path = SCHEMA_PATH) {
  const sql = (await readFile(path, 'utf8')).trim();
  if (!sql) throw new Error('schema.sql is empty');
  return sql;
}
