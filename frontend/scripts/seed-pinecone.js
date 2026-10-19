// Seeds Pinecone (integrated embedding) from data/faq.sample.json.
// Per FAQ item: 1 + N chunks (see .agents/propose/example-chank.md). Chunk 01 embeds the original text,
// chunks 02.. embed one question each; `answer` is the original text in every chunk.
// Only records that are new or whose content_hash differs from the index are sent; nothing is deleted.
// Usage: npm run seed [-- --dry-run] [-- path/to/faq.json]
import { readFile } from 'node:fs/promises';
import { Pinecone } from '@pinecone-database/pinecone';
import { toRecords, diffRecords, fetchExisting } from './seed-lib.js';

const BATCH_SIZE = 96; // upsertRecords limit for integrated-embedding indexes

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const file = args.find((a) => !a.startsWith('--')) ?? '../data/faq.sample.json';

// Must match the index field_map (the field Pinecone embeds)
const textField = process.env.PINECONE_TEXT_FIELD || 'text';
const namespace = process.env.PINECONE_NAMESPACE || '__default__';

const records = toRecords(JSON.parse(await readFile(file, 'utf8')), textField);

console.log(`${records.length} records from ${file} -> namespace "${namespace}", embedded field "${textField}"`);

const hasCredentials = Boolean(process.env.PINECONE_API_KEY && process.env.PINECONE_INDEX_NAME);
if (dryRun && !hasCredentials) process.exit(0);

for (const name of ['PINECONE_API_KEY', 'PINECONE_INDEX_NAME']) {
  if (!process.env[name]) throw new Error(`${name} is not set`);
}

const index = new Pinecone({ apiKey: process.env.PINECONE_API_KEY })
  .index({ name: process.env.PINECONE_INDEX_NAME, namespace });

const existing = await fetchExisting(index, records.map((r) => r._id));
const { toSend, newCount, changedCount, unchangedCount } = diffRecords(records, existing);
console.log(`${newCount} new, ${changedCount} changed, ${unchangedCount} unchanged`);
if (dryRun) process.exit(0);

for (let i = 0; i < toSend.length; i += BATCH_SIZE) {
  const batch = toSend.slice(i, i + BATCH_SIZE);
  await index.upsertRecords({ records: batch });
  console.log(`upserted ${i + batch.length}/${toSend.length}`);
}
