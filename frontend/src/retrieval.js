import { Pinecone } from '@pinecone-database/pinecone';

export const filterHits = (hits, minScore) => hits.filter((h) => h._score >= minScore);

export function groupByParent(hits) {
  const groups = new Map();
  for (const hit of hits) {
    const id = hit.fields?.parent_id;
    const answer = hit.fields?.answer;
    if (!id || !answer) continue;
    const group = groups.get(id);
    if (!group || hit._score > group.score) groups.set(id, { parentId: id, answer, score: hit._score });
  }
  return [...groups.values()].sort((a, b) => b.score - a.score);
}

export function createRetrieval(config, index = null, rerank = null) {
  let pc = null;
  const getPinecone = () => (pc ??= new Pinecone({ apiKey: config.pineconeApiKey }));
  const getIndex = () =>
    (index ??= getPinecone().index({
      name: config.pineconeIndexName,
      namespace: config.pineconeNamespace,
    }));
  const rerankDocs = (options) => (rerank ? rerank(options) : getPinecone().inference.rerank(options));

  async function rerankGroups(text, groups) {
    const res = await rerankDocs({
      model: config.rerankModel,
      query: text,
      documents: groups.map((g) => ({ answer: g.answer })),
      rankFields: ['answer'],
      topN: groups.length,
      returnDocuments: false,
    });
    return res.data
      .map((r) => ({ ...groups[r.index], score: r.score }))
      .filter((g) => g.score >= config.rerankMinScore)
      .sort((a, b) => b.score - a.score);
  }

  return async function search(text) {
    const res = await getIndex().searchRecords({
      query: { topK: config.vectorTopK, inputs: { text } },
      fields: ['parent_id', 'answer'],
    });
    const hits = res.result?.hits ?? [];
    const groups = groupByParent(filterHits(hits, config.vectorMinScore));
    if (!config.rerankModel || groups.length === 0) return { hits: hits.length, groups };
    return { hits: hits.length, groups: await rerankGroups(text, groups) };
  };
}
