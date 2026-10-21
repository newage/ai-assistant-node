# Proposal

## Why

`npm run seed` sends all records to Pinecone every time (currently 310), even if only one question changed in `data/faq.sample.json`. Pinecone recomputes the embeddings for everything, so this is wasted cost and time. After adding one question, we want to send only that one.

## What Changes

- Before sending, `scripts/seed-pinecone.js` reads the records already in the index by id (`index.fetch`, batches of 100) and compares them with what is built from the JSON. Only new and changed records go into `upsertRecords`.
- Each record gets an extra metadata field `content_hash`, a hash of everything that defines the record's content (embedded text, `answer`, `lang`, `type`, `project`). One field is compared instead of several.
- A record that is not in the index, or has no `content_hash`, counts as new/changed. This is a safe fallback: in the worst case the current behavior results (send everything).
- The script prints a summary like `3 new, 1 changed, 247 unchanged`.
- `--dry-run` shows this summary without writing. If `PINECONE_API_KEY` and `PINECONE_INDEX_NAME` are set, the summary is computed against the index. Without them the current behavior stays (number of records).
- The logic (building records, hash, comparison, batched reading) is moved from the entry script into a separate module, so it can be covered by tests without the network.
- README: a description of the behavior and the rule "add new questions to the end of `questions`", so that chunk numbers do not shift.
- **One-off**: existing records in the index do not have `content_hash` yet, so the first run after the change will send everything. After that only deltas are sent.

## Capabilities

### New Capabilities
- `faq-seeding`: filling Pinecone from the FAQ file: record identifiers, incremental sending of only changed records, the summary and dry-run mode.

### Modified Capabilities
<!-- none: openspec/specs is empty, the earlier seed behavior was not described by a spec -->

## Impact

- `frontend/scripts/seed-pinecone.js` (reduced to an entry point), a new `frontend/scripts/seed-lib.js`, a new test in `frontend/test/`.
- `frontend/README.md`: the seed section.
- Dependencies do not change (`@pinecone-database/pinecone` ^9). The `/chat` runtime does not change: search requests only `parent_id` and `answer`.
- Out of scope: deleting records that are not in the JSON (`--prune`), a local manifest, changing the `faq.sample.json` format, changing the `_id` scheme.
