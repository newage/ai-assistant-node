// Pure helpers for seed-pinecone.js: record building, content hashing, diffing against the index.
import { createHash } from 'node:crypto';

const FETCH_BATCH_SIZE = 100;

// Changing this formula makes every stored record count as changed.
export function contentHash({ embedded, answer, lang, type, project }) {
  return createHash('sha256')
    .update(JSON.stringify([embedded, answer, lang, type, project ?? null]))
    .digest('hex');
}

export function toRecords(items, textField = 'text') {
  const records = items.flatMap((item) => {
    if (!item.parent_id || !item.text || !Array.isArray(item.questions)) {
      throw new Error(`Invalid FAQ item: ${JSON.stringify(item).slice(0, 120)}`);
    }
    return [item.text, ...item.questions].map((embedded, i) => ({
      _id: `${item.parent_id}-${String(i + 1).padStart(2, '0')}`,
      parent_id: item.parent_id,
      type: item.type,
      // Pinecone metadata does not accept null
      ...(item.project ? { project: item.project } : {}),
      lang: item.lang,
      [textField]: embedded,
      answer: item.text,
      content_hash: contentHash({ embedded, answer: item.text, lang: item.lang, type: item.type, project: item.project }),
    }));
  });
  if (new Set(records.map((r) => r._id)).size !== records.length) throw new Error('Duplicate record ids');
  return records;
}

// existing: Map id -> metadata. Absent id = new; absent or different content_hash = changed.
export function diffRecords(records, existing) {
  const toSend = [];
  let newCount = 0;
  let changedCount = 0;
  for (const record of records) {
    const stored = existing.get(record._id);
    if (!stored) {
      newCount++;
      toSend.push(record);
    } else if (stored.content_hash !== record.content_hash) {
      changedCount++;
      toSend.push(record);
    }
  }
  return { toSend, newCount, changedCount, unchangedCount: records.length - toSend.length };
}

export async function fetchExisting(index, ids) {
  const existing = new Map();
  for (let i = 0; i < ids.length; i += FETCH_BATCH_SIZE) {
    const { records } = await index.fetch({ ids: ids.slice(i, i + FETCH_BATCH_SIZE) });
    for (const [id, record] of Object.entries(records ?? {})) existing.set(id, record.metadata ?? {});
  }
  return existing;
}
