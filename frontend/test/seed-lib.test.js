import { test, expect } from '@jest/globals';
import { toRecords, diffRecords, fetchExisting } from '../scripts/seed-lib.js';

const item = (over = {}) => ({ parent_id: 'a', type: 'faq', lang: 'en', text: 'Answer', questions: ['Q1', 'Q2'], ...over });

const stored = (records) => new Map(records.map((r) => [r._id, { content_hash: r.content_hash }]));

test('toRecords: ids follow position and answer is in every chunk', () => {
  const records = toRecords([item()]);
  expect(records.map((r) => r._id)).toStrictEqual(['a-01', 'a-02', 'a-03']);
  expect(records.map((r) => r.text)).toStrictEqual(['Answer', 'Q1', 'Q2']);
  expect(records.every((r) => r.answer === 'Answer')).toBeTruthy();
});

test('toRecords: project is omitted when absent', () => {
  const [plain] = toRecords([item()]);
  const [withProject] = toRecords([item({ project: 'p' })]);
  expect(!('project' in plain)).toBeTruthy();
  expect(withProject.project).toBe('p');
});

test('toRecords: duplicate ids fail', () => {
  expect(() => toRecords([item(), item()])).toThrow(/Duplicate record ids/);
});

test('toRecords: uses the configured text field', () => {
  const [record] = toRecords([item()], 'chunk_text');
  expect(record.chunk_text).toBe('Answer');
  expect(!('text' in record)).toBeTruthy();
});

test('diffRecords: nothing changed', () => {
  const records = toRecords([item()]);
  const diff = diffRecords(records, stored(records));
  expect(diff).toStrictEqual({ toSend: [], newCount: 0, changedCount: 0, unchangedCount: 3 });
});

test('diffRecords: question appended sends only the new record', () => {
  const before = toRecords([item()]);
  const after = toRecords([item({ questions: ['Q1', 'Q2', 'Q3'] })]);
  const diff = diffRecords(after, stored(before));
  expect(diff.toSend.map((r) => r._id)).toStrictEqual(['a-04']);
  expect(diff.newCount).toBe(1);
  expect(diff.unchangedCount).toBe(3);
});

test('diffRecords: changed text sends all chunks of that item only', () => {
  const before = toRecords([item(), item({ parent_id: 'b' })]);
  const after = toRecords([item({ text: 'New answer' }), item({ parent_id: 'b' })]);
  const diff = diffRecords(after, stored(before));
  expect(diff.toSend.map((r) => r._id)).toStrictEqual(['a-01', 'a-02', 'a-03']);
  expect(diff.changedCount).toBe(3);
  expect(diff.unchangedCount).toBe(3);
});

test('diffRecords: changed lang sends all chunks of that item', () => {
  const before = toRecords([item()]);
  const after = toRecords([item({ lang: 'uk' })]);
  expect(diffRecords(after, stored(before)).changedCount).toBe(3);
});

test('diffRecords: stored record without hash counts as changed', () => {
  const records = toRecords([item()]);
  const existing = new Map(records.map((r) => [r._id, { answer: r.answer, text: r.text }]));
  const diff = diffRecords(records, existing);
  expect(diff.changedCount).toBe(3);
  expect(diff.toSend.length).toBe(3);
});

test('diffRecords: removed question does not affect the rest', () => {
  const before = toRecords([item()]);
  const after = toRecords([item({ questions: ['Q1'] })]);
  const diff = diffRecords(after, stored(before));
  expect(diff).toStrictEqual({ toSend: [], newCount: 0, changedCount: 0, unchangedCount: 2 });
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
  expect(calls).toStrictEqual([100, 100, 50]);
  expect(existing.size).toBe(249);
  expect(existing.get('id-120').content_hash).toBe('id-120');
});

test('fetchExisting: fetch errors propagate', async () => {
  const index = { fetch: async () => { throw new Error('boom'); } };
  await expect(fetchExisting(index, ['a-01'])).rejects.toThrow(/boom/);
});
