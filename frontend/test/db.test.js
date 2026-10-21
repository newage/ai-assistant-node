import { test, expect } from '@jest/globals';
import { createDb, NotConfiguredError } from '../src/db.js';

test('insert is parameterised: values never reach the SQL text', async () => {
  let call;
  const sql = async (strings, ...values) => ((call = { text: strings.join('?'), values }), []);
  const evil = "'); DROP TABLE reactions; --";
  await createDb({}, sql).record({ question: evil, answer: 'A', reaction: 'good' });
  expect(call.values).toStrictEqual([evil, 'A', 'good']);
  expect(call.text).not.toContain('DROP');
  expect(call.text).toContain('INSERT INTO reactions');
});

test('missing answer and reaction are stored as null', async () => {
  let values;
  const sql = async (strings, ...v) => ((values = v), []);
  await createDb({}, sql).record({ question: 'q' });
  expect(values).toStrictEqual(['q', null, null]);
});

test('no connection at creation; empty DATABASE_URL throws not configured on use', async () => {
  const db = createDb({ databaseUrl: '' });
  await expect(db.record({ question: 'q' })).rejects.toBeInstanceOf(NotConfiguredError);
});
