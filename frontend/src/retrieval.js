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

export function createRetrieval(config, index = null) {
  const getIndex = () =>
    (index ??= new Pinecone({ apiKey: config.pineconeApiKey }).index({
      name: config.pineconeIndexName,
      namespace: config.pineconeNamespace,
    }));

  return async function search(text) {
    const res = await getIndex().searchRecords({
      query: { topK: config.vectorTopK, inputs: { text } },
      fields: ['parent_id', 'answer'],
    });
    const hits = res.result?.hits ?? [];
    return { hits: hits.length, groups: groupByParent(filterHits(hits, config.vectorMinScore)) };
  };
}
