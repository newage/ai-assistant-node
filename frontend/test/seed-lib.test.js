import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toRecords, diffRecords, fetchExisting } from '../scripts/seed-lib.js';

const item = (over = {}) => ({ parent_id: 'a', type: 'faq', lang: 'en', text: 'Answer', questions: ['Q1', 'Q2'], ...over });

const stored = (records) => new Map(records.map((r) => [r._id, { content_hash: r.content_hash }]));

test('toRecords: ids follow position and answer is in every chunk', () => {
  const records = toRecords([item()]);
  assert.deepEqual(records.map((r) => r._id), ['a-01', 'a-02', 'a-03']);
  assert.deepEqual(records.map((r) => r.text), ['Answer', 'Q1', 'Q2']);
  assert.ok(records.every((r) => r.answer === 'Answer'));
});

test('toRecords: project is omitted when absent', () => {
  const [plain] = toRecords([item()]);
  const [withProject] = toRecords([item({ project: 'p' })]);
  assert.ok(!('project' in plain));
  assert.equal(withProject.project, 'p');
});

test('toRecords: duplicate ids fail', () => {
  assert.throws(() => toRecords([item(), item()]), /Duplicate record ids/);
});

test('toRecords: uses the configured text field', () => {
  const [record] = toRecords([item()], 'chunk_text');
  assert.equal(record.chunk_text, 'Answer');
  assert.ok(!('text' in record));
});

test('diffRecords: nothing changed', () => {
  const records = toRecords([item()]);
  const diff = diffRecords(records, stored(records));
  assert.deepEqual(diff, { toSend: [], newCount: 0, changedCount: 0, unchangedCount: 3 });
});

test('diffRecords: question appended sends only the new record', () => {
  const before = toRecords([item()]);
  const after = toRecords([item({ questions: ['Q1', 'Q2', 'Q3'] })]);
  const diff = diffRecords(after, stored(before));
  assert.deepEqual(diff.toSend.map((r) => r._id), ['a-04']);
  assert.equal(diff.newCount, 1);
  assert.equal(diff.unchangedCount, 3);
});

test('diffRecords: changed text sends all chunks of that item only', () => {
  const before = toRecords([item(), item({ parent_id: 'b' })]);
  const after = toRecords([item({ text: 'New answer' }), item({ parent_id: 'b' })]);
  const diff = diffRecords(after, stored(before));
  assert.deepEqual(diff.toSend.map((r) => r._id), ['a-01', 'a-02', 'a-03']);
  assert.equal(diff.changedCount, 3);
  assert.equal(diff.unchangedCount, 3);
});

test('diffRecords: changed lang sends all chunks of that item', () => {
  const before = toRecords([item()]);
  const after = toRecords([item({ lang: 'uk' })]);
  assert.equal(diffRecords(after, stored(before)).changedCount, 3);
});

test('diffRecords: stored record without hash counts as changed', () => {
  const records = toRecords([item()]);
  const existing = new Map(records.map((r) => [r._id, { answer: r.answer, text: r.text }]));
  const diff = diffRecords(records, existing);
  assert.equal(diff.changedCount, 3);
  assert.equal(diff.toSend.length, 3);
});

test('diffRecords: removed question does not affect the rest', () => {
  const before = toRecords([item()]);
  const after = toRecords([item({ questions: ['Q1'] })]);
  const diff = diffRecords(after, stored(before));
  assert.deepEqual(diff, { toSend: [], newCount: 0, changedCount: 0, unchangedCount: 2 });
});

test('fetchExisting: batches by 100 and merges responses', async () => {
  const calls = [];
  const index = {
    fetch: async ({ ids }) => {
      calls.push(ids.length);
      return { records: Object.fromEntries(ids.filter((id) => id !== 'id-7').map((id) => [id, { id, metadata: { content_hash: id } }])) };
    },
  };
  const ids = Array.from({ length: 250 }, (_, i) => `id-${i}`);
  const existing = await fetchExisting(index, ids);
  assert.deepEqual(calls, [100, 100, 50]);
  assert.equal(existing.size, 249);
  assert.equal(existing.get('id-120').content_hash, 'id-120');
});

test('fetchExisting: fetch errors propagate', async () => {
  const index = { fetch: async () => { throw new Error('boom'); } };
  await assert.rejects(fetchExisting(index, ['a-01']), /boom/);
});
