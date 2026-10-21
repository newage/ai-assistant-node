import { test, expect } from '@jest/globals';
import { createApp } from '../src/index.js';
import { TEXTS } from '../src/messages.js';
import { createRetrieval } from '../src/retrieval.js';

async function call({ body, raw, limited = false, groups = [{ parentId: 'a', answer: 'AA', score: 0.9 }], searchError, answerError, recordError }) {
  const calls = { search: 0, answer: 0, question: null, rows: [] };
  const app = createApp({
    log: () => {},
    isRateLimited: async () => limited,
    search: async (q) => {
      calls.search++;
      if (searchError) throw new Error('pinecone down');
      return { hits: groups.length, groups };
    },
    record: async (row) => {
      if (recordError) throw new Error('db down');
      calls.rows.push(row);
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
  expect(r.status).toBe(200);
  expect(r.json).toStrictEqual({ reply: 'ANSWER' });
  expect(r.calls.question).toBe('last');
  expect(r.calls.answer).toBe(1);
});

test('200 no data without calling Claude (unknown lang -> English)', async () => {
  const r = await call({ body: { messages: [user('q', 'de')] }, groups: [] });
  expect(r.status).toBe(200);
  expect(r.json.reply).toBe(TEXTS.noData.en);
  expect(r.calls.answer).toBe(0);
});

test('400 validation errors call nothing upstream', async () => {
  const r = await call({ body: { messages: [user('  ')] } });
  expect(r.status).toBe(400);
  expect(r.json.error).toBeTruthy();
  expect(r.calls.search + r.calls.answer).toBe(0);
});

test('400 too long -> localized reply', async () => {
  const r = await call({ body: { messages: [user('x'.repeat(201), 'pl')] } });
  expect(r.status).toBe(400);
  expect(r.json.reply).toBe(TEXTS.tooLong.pl);
});

test('400 on invalid JSON', async () => {
  const r = await call({ raw: '{nope' });
  expect(r.status).toBe(400);
  expect(r.json.error).toBeTruthy();
});

test('429 localized, nothing upstream called', async () => {
  const r = await call({ body: { messages: [user('q', 'uk')] }, limited: true });
  expect(r.status).toBe(429);
  expect(r.json.reply).toBe('Забагато запитів. Будь ласка, спробуйте пізніше.');
  expect(r.calls.search + r.calls.answer).toBe(0);
});

test('429 beats 400 for an invalid body; unreadable body -> English', async () => {
  const a = await call({ body: { messages: [] }, limited: true });
  expect(a.status).toBe(429);
  const b = await call({ raw: '{nope', limited: true });
  expect(b.status).toBe(429);
  expect(b.json.reply).toBe(TEXTS.rateLimited.en);
});

test('502 when Pinecone fails, Claude not called', async () => {
  const r = await call({ body: { messages: [user('q', 'pl')] }, searchError: true });
  expect(r.status).toBe(502);
  expect(r.json.reply).toBe(TEXTS.failure.pl);
  expect(r.calls.answer).toBe(0);
});

test('502 when Claude fails', async () => {
  const r = await call({ body: { messages: [user('q')] }, answerError: true });
  expect(r.status).toBe(502);
  expect(r.json.reply).toBe(TEXTS.failure.en);
});

async function callWithRerank(rerank) {
  const calls = { answer: 0 };
  const index = { searchRecords: async () => ({ result: { hits: [{ _score: 0.9, fields: { parent_id: 'a', answer: 'AA' } }] } }) };
  const config = { vectorTopK: 10, vectorMinScore: 0.84, rerankModel: 'm', rerankMinScore: 0.5 };
  const app = createApp({
    log: () => {},
    isRateLimited: async () => false,
    search: createRetrieval(config, index, rerank),
    answer: async () => (calls.answer++, 'ANSWER'),
  });
  const server = app.listen(0);
  try {
    const res = await fetch(`http://127.0.0.1:${server.address().port}/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ messages: [user('q')] }),
    });
    return { status: res.status, json: await res.json(), calls };
  } finally {
    server.close();
  }
}

test('200 no data when rerank drops every group, Claude not called', async () => {
  const r = await callWithRerank(async () => ({ data: [{ index: 0, score: 0.1 }] }));
  expect(r.status).toBe(200);
  expect(r.json.reply).toBe(TEXTS.noData.en);
  expect(r.calls.answer).toBe(0);
});

test('502 when rerank fails, Claude not called', async () => {
  const r = await callWithRerank(async () => {
    throw new Error('rerank down');
  });
  expect(r.status).toBe(502);
  expect(r.json.reply).toBe(TEXTS.failure.en);
  expect(r.calls.answer).toBe(0);
});

test('no data is recorded with the fixed text and null reaction', async () => {
  const r = await call({ body: { messages: [user('q', 'pl')] }, groups: [] });
  expect(r.calls.rows).toStrictEqual([{ question: 'q', answer: TEXTS.noData.pl, reaction: null }]);
});

test('Pinecone and Claude failures are recorded with null answer', async () => {
  for (const opts of [{ searchError: true }, { answerError: true }]) {
    const r = await call({ body: { messages: [user('q')] }, ...opts });
    expect(r.status).toBe(502);
    expect(r.calls.rows).toStrictEqual([{ question: 'q', answer: null, reaction: null }]);
  }
});

test('successful answers, 400 and 429 record nothing', async () => {
  const ok = await call({ body: { messages: [user('q')] } });
  const bad = await call({ body: { messages: [user('  ')] } });
  const limited = await call({ body: { messages: [user('q')] }, limited: true });
  expect(ok.calls.rows.length + bad.calls.rows.length + limited.calls.rows.length).toBe(0);
});

test('a failing record does not change the response', async () => {
  const noData = await call({ body: { messages: [user('q')] }, groups: [], recordError: true });
  expect(noData.status).toBe(200);
  expect(noData.json.reply).toBe(TEXTS.noData.en);
  const failure = await call({ body: { messages: [user('q')] }, answerError: true, recordError: true });
  expect(failure.status).toBe(502);
  expect(failure.json.reply).toBe(TEXTS.failure.en);
});
