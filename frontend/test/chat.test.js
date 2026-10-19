import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/index.js';
import { TEXTS } from '../src/messages.js';

async function call({ body, raw, limited = false, groups = [{ parentId: 'a', answer: 'AA', score: 0.9 }], searchError, answerError }) {
  const calls = { search: 0, answer: 0, question: null };
  const app = createApp({
    log: () => {},
    isRateLimited: async () => limited,
    search: async (q) => {
      calls.search++;
      if (searchError) throw new Error('pinecone down');
      return { hits: groups.length, groups };
    },
    answer: async (q) => {
      calls.answer++;
      calls.question = q;
      if (answerError) throw new Error('claude down');
      return 'ANSWER';
    },
  });
  const server = app.listen(0);
  try {
    const res = await fetch(`http://127.0.0.1:${server.address().port}/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: raw ?? JSON.stringify(body),
    });
    return { status: res.status, json: await res.json(), calls };
  } finally {
    server.close();
  }
}

const user = (content, lang = 'en') => ({ role: 'user', content, lang });

test('200 with answer; only last message is used', async () => {
  const r = await call({ body: { messages: [user('first'), user('last')] } });
  assert.equal(r.status, 200);
  assert.deepEqual(r.json, { reply: 'ANSWER' });
  assert.equal(r.calls.question, 'last');
  assert.equal(r.calls.answer, 1);
});

test('200 no data without calling Claude (unknown lang -> English)', async () => {
  const r = await call({ body: { messages: [user('q', 'de')] }, groups: [] });
  assert.equal(r.status, 200);
  assert.equal(r.json.reply, TEXTS.noData.en);
  assert.equal(r.calls.answer, 0);
});

test('400 validation errors call nothing upstream', async () => {
  const r = await call({ body: { messages: [user('  ')] } });
  assert.equal(r.status, 400);
  assert.ok(r.json.error);
  assert.equal(r.calls.search + r.calls.answer, 0);
});

test('400 too long -> localized reply', async () => {
  const r = await call({ body: { messages: [user('x'.repeat(201), 'pl')] } });
  assert.equal(r.status, 400);
  assert.equal(r.json.reply, TEXTS.tooLong.pl);
});

test('400 on invalid JSON', async () => {
  const r = await call({ raw: '{nope' });
  assert.equal(r.status, 400);
  assert.ok(r.json.error);
});

test('429 localized, nothing upstream called', async () => {
  const r = await call({ body: { messages: [user('q', 'uk')] }, limited: true });
  assert.equal(r.status, 429);
  assert.equal(r.json.reply, 'Забагато запитів. Будь ласка, спробуйте пізніше.');
  assert.equal(r.calls.search + r.calls.answer, 0);
});

test('429 beats 400 for an invalid body; unreadable body -> English', async () => {
  const a = await call({ body: { messages: [] }, limited: true });
  assert.equal(a.status, 429);
  const b = await call({ raw: '{nope', limited: true });
  assert.equal(b.status, 429);
  assert.equal(b.json.reply, TEXTS.rateLimited.en);
});

test('502 when Pinecone fails, Claude not called', async () => {
  const r = await call({ body: { messages: [user('q', 'pl')] }, searchError: true });
  assert.equal(r.status, 502);
  assert.equal(r.json.reply, TEXTS.failure.pl);
  assert.equal(r.calls.answer, 0);
});

test('502 when Claude fails', async () => {
  const r = await call({ body: { messages: [user('q')] }, answerError: true });
  assert.equal(r.status, 502);
  assert.equal(r.json.reply, TEXTS.failure.en);
});
