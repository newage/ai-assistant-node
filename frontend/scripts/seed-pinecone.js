// Seeds Pinecone (integrated embedding) from data/faq.sample.json.
// Per FAQ item: 1 + N chunks (see .agents/propose/example-chank.md). Chunk 01 embeds the original text,
// chunks 02.. embed one question each; `answer` is the original text in every chunk.
// Usage: npm run seed [-- --dry-run] [-- path/to/faq.json]
import { readFile } from 'node:fs/promises';
import { Pinecone } from '@pinecone-database/pinecone';

const BATCH_SIZE = 96; // upsertRecords limit for integrated-embedding indexes

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const file = args.find((a) => !a.startsWith('--')) ?? '../data/faq.sample.json';

// Must match the index field_map (the field Pinecone embeds)
const textField = process.env.PINECONE_TEXT_FIELD || 'text';
const namespace = process.env.PINECONE_NAMESPACE || '__default__';

function toRecords(items) {
  return items.flatMap((item) => {
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
    }));
  });
}

const records = toRecords(JSON.parse(await readFile(file, 'utf8')));
const ids = new Set(records.map((r) => r._id));
if (ids.size !== records.length) throw new Error('Duplicate record ids');

console.log(`${records.length} records from ${file} -> namespace "${namespace}", embedded field "${textField}"`);
if (dryRun) process.exit(0);

for (const name of ['PINECONE_API_KEY', 'PINECONE_INDEX_NAME']) {
  if (!process.env[name]) throw new Error(`${name} is not set`);
}

const index = new Pinecone({ apiKey: process.env.PINECONE_API_KEY })
  .index({ name: process.env.PINECONE_INDEX_NAME, namespace });

for (let i = 0; i < records.length; i += BATCH_SIZE) {
  const batch = records.slice(i, i + BATCH_SIZE);
  await index.upsertRecords({ records: batch });
  console.log(`upserted ${i + batch.length}/${records.length}`);
}
