import { test, expect } from '@jest/globals';
import { filterHits, groupByParent, createRetrieval } from '../src/retrieval.js';

const hit = (parent_id, score, answer = `A-${parent_id}`) => ({ _score: score, fields: { parent_id, answer } });

test('hits below threshold are dropped, equal kept', () => {
  expect(filterHits([hit('a', 0.9), hit('b', 0.84), hit('c', 0.5)], 0.84).map((h) => h.fields.parent_id)).toStrictEqual(['a', 'b']);
});

test('three chunks of one parent_id -> one group with max score', () => {
  const groups = groupByParent([hit('a', 0.85), hit('a', 0.92), hit('a', 0.88)]);
  expect(groups.length).toBe(1);
  expect(groups[0].score).toBe(0.92);
  expect(groups[0].answer).toBe('A-a');
});

test('groups are ordered by score', () => {
  expect(groupByParent([hit('a', 0.85), hit('b', 0.95), hit('c', 0.9)]).map((g) => g.parentId)).toStrictEqual(['b', 'c', 'a']);
});

test('search wires topK, fields and threshold', async () => {
  let options;
  const index = {
    searchRecords: async (o) => ((options = o), { result: { hits: [hit('a', 0.9), hit('b', 0.2)] } }),
  };
  const search = createRetrieval({ vectorTopK: 7, vectorMinScore: 0.84 }, index);
  const res = await search('who?');
  expect(options.query.topK).toBe(7);
  expect(options.query.inputs.text).toBe('who?');
  expect(res.groups.map((g) => g.parentId)).toStrictEqual(['a']);
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
  expect(calls.length).toBe(0);
  expect(res.groups.map((g) => g.parentId)).toStrictEqual(['b', 'a']);
});

test('group with high dense but low rerank score is dropped', async () => {
  // groups after prefilter by dense: b (0.95), a (0.9)
  const { search } = rerankSetup([0.1, 0.8]);
  const res = await search('q');
  expect(res.groups.map((g) => [g.parentId, g.score])).toStrictEqual([['a', 0.8]]);
});

test('groups are ordered by rerank score and threshold is inclusive', async () => {
  const { search } = rerankSetup([0.5, 0.9]);
  const res = await search('q');
  expect(res.groups.map((g) => g.parentId)).toStrictEqual(['a', 'b']);
});

test('three chunks of one parent_id give one rerank document', async () => {
  const { calls, search } = rerankSetup([0.9, 0.9]);
  await search('q');
  expect(calls[0].documents.length).toBe(2);
  expect(calls[0].documents.map((d) => d.answer)).toStrictEqual(['A-b', 'A-a']);
  expect(calls[0].rankFields).toStrictEqual(['answer']);
  expect(calls[0].query).toBe('q');
  expect(calls[0].topN).toBe(2);
  expect(calls[0].model).toBe('m');
});

test('no groups after prefilter: rerank is not called', async () => {
  const { calls, search } = rerankSetup([], { vectorMinScore: 0.99 });
  const res = await search('q');
  expect(calls.length).toBe(0);
  expect(res.groups).toStrictEqual([]);
});

test('rerank failure rejects search', async () => {
  const { search } = rerankSetup(new Error('rerank down'));
  await expect(search('q')).rejects.toThrow(/rerank down/);
});
