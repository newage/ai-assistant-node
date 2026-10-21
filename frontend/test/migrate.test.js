import { test, expect } from '@jest/globals';
import { readSchema } from '../scripts/migrate-lib.js';

test('schema.sql creates reactions idempotently with good/bad check', async () => {
  const sql = await readSchema();
  expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS reactions/);
  expect(sql).toMatch(/reaction IN \('good', 'bad'\)/);
  expect(sql).not.toMatch(/error/);
});
