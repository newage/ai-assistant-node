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

const rerankSetup = (scores, config = {}) => {
  const calls = [];
  const index = {
    searchRecords: async () => ({ result: { hits: [hit('a', 0.9), hit('a', 0.88), hit('a', 0.86), hit('b', 0.95), hit('c', 0.3)] } }),
  };
  const rerank = async (o) => {
    calls.push(o);
    if (scores instanceof Error) throw scores;
    return { data: o.documents.map((_, i) => ({ index: i, score: scores[i] })) };
  };
  const cfg = { vectorTopK: 10, vectorMinScore: 0.84, rerankModel: 'm', rerankMinScore: 0.5, ...config };
  return { calls, search: createRetrieval(cfg, index, rerank) };
};

test('rerank disabled: not called, dense order kept', async () => {
  const { calls, search } = rerankSetup([0, 1], { rerankModel: '' });
  const res = await search('q');
  assert.equal(calls.length, 0);
  assert.deepEqual(res.groups.map((g) => g.parentId), ['b', 'a']);
});

test('group with high dense but low rerank score is dropped', async () => {
  // groups after prefilter by dense: b (0.95), a (0.9)
  const { search } = rerankSetup([0.1, 0.8]);
  const res = await search('q');
  assert.deepEqual(res.groups.map((g) => [g.parentId, g.score]), [['a', 0.8]]);
});

test('groups are ordered by rerank score and threshold is inclusive', async () => {
  const { search } = rerankSetup([0.5, 0.9]);
  const res = await search('q');
  assert.deepEqual(res.groups.map((g) => g.parentId), ['a', 'b']);
});

test('three chunks of one parent_id give one rerank document', async () => {
  const { calls, search } = rerankSetup([0.9, 0.9]);
  await search('q');
  assert.equal(calls[0].documents.length, 2);
  assert.deepEqual(calls[0].documents.map((d) => d.answer), ['A-b', 'A-a']);
  assert.deepEqual(calls[0].rankFields, ['answer']);
  assert.equal(calls[0].query, 'q');
  assert.equal(calls[0].topN, 2);
  assert.equal(calls[0].model, 'm');
});

test('no groups after prefilter: rerank is not called', async () => {
  const { calls, search } = rerankSetup([], { vectorMinScore: 0.99 });
  const res = await search('q');
  assert.equal(calls.length, 0);
  assert.deepEqual(res.groups, []);
});

test('rerank failure rejects search', async () => {
  const { search } = rerankSetup(new Error('rerank down'));
  await assert.rejects(search('q'), /rerank down/);
});
