import { test, expect } from '@jest/globals';
import { createApp } from '../src/index.js';
import { NotConfiguredError } from '../src/db.js';

async function post({ body, raw, recordError }) {
  const rows = [];
  const app = createApp({
    log: () => {},
    record: async (row) => {
      if (recordError) throw recordError;
      rows.push(row);
    },
  });
  const server = app.listen(0);
  try {
    const res = await fetch(`http://127.0.0.1:${server.address().port}/answer`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: raw ?? JSON.stringify(body),
    });
    return { status: res.status, json: await res.json(), rows };
  } finally {
    server.close();
  }
}

const valid = { question: 'Who?', answer: 'Me', reaction: 'good' };

test('201 on valid body and record gets the exact values', async () => {
  const r = await post({ body: valid });
  expect(r.status).toBe(201);
  expect(r.rows).toStrictEqual([valid]);
});

test('same body twice stores two rows (no dedup)', async () => {
  const rows = [];
  const app = createApp({ log: () => {}, record: async (row) => rows.push(row) });
  const server = app.listen(0);
  try {
    for (let i = 0; i < 2; i++) {
      await fetch(`http://127.0.0.1:${server.address().port}/answer`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(valid),
      });
    }
  } finally {
    server.close();
  }
  expect(rows.length).toBe(2);
});

test('400 cases write nothing', async () => {
  for (const body of [{ ...valid, reaction: 'error' }, { ...valid, answer: ' ' }, { ...valid, question: 'x'.repeat(201) }]) {
    const r = await post({ body });
    expect(r.status).toBe(400);
    expect(r.json.error).toBeTruthy();
    expect(r.rows).toStrictEqual([]);
  }
});

test('400 on invalid JSON', async () => {
  const r = await post({ raw: '{nope' });
  expect(r.status).toBe(400);
  expect(r.json.error).toBeTruthy();
  expect(r.rows).toStrictEqual([]);
});

test('503 when the database is not configured', async () => {
  const r = await post({ body: valid, recordError: new NotConfiguredError() });
  expect(r.status).toBe(503);
  expect(r.rows).toStrictEqual([]);
});

test('500 when the write fails', async () => {
  const r = await post({ body: valid, recordError: new Error('db down') });
  expect(r.status).toBe(500);
});
