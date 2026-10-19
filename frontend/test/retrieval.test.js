import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filterHits, groupByParent, createRetrieval } from '../src/retrieval.js';

const hit = (parent_id, score, answer = `A-${parent_id}`) => ({ _score: score, fields: { parent_id, answer } });

test('hits below threshold are dropped, equal kept', () => {
  assert.deepEqual(filterHits([hit('a', 0.9), hit('b', 0.84), hit('c', 0.5)], 0.84).map((h) => h.fields.parent_id), ['a', 'b']);
});

test('three chunks of one parent_id -> one group with max score', () => {
  const groups = groupByParent([hit('a', 0.85), hit('a', 0.92), hit('a', 0.88)]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].score, 0.92);
  assert.equal(groups[0].answer, 'A-a');
});

test('groups are ordered by score', () => {
  assert.deepEqual(groupByParent([hit('a', 0.85), hit('b', 0.95), hit('c', 0.9)]).map((g) => g.parentId), ['b', 'c', 'a']);
});

test('search wires topK, fields and threshold', async () => {
  let options;
  const index = {
    searchRecords: async (o) => ((options = o), { result: { hits: [hit('a', 0.9), hit('b', 0.2)] } }),
  };
  const search = createRetrieval({ vectorTopK: 7, vectorMinScore: 0.84 }, index);
  const res = await search('who?');
  assert.equal(options.query.topK, 7);
  assert.equal(options.query.inputs.text, 'who?');
  assert.deepEqual(res.groups.map((g) => g.parentId), ['a']);
});
