# Design

## Context

`scripts/seed-pinecone.js` builds records (`toRecords`), checks id uniqueness and sends everything through `upsertRecords` in batches of 96. The index is created with integrated embedding: Pinecone computes the vector from the `text` field itself. The motivation and boundaries are in `proposal.md`, the requirements in `specs/faq-seeding/spec.md`.

Checked in the installed `@pinecone-database/pinecone@9.0.0`:
- `index.fetch({ ids })` returns `records` by id with `metadata?`, and the limit of ids per request is set by the API (batches of 100 are planned). The method has no separate mode for integrated indexes.
- The SDK documentation does not guarantee that the field the embedding is computed from (`text`) is returned by `fetch`. Relying on a direct comparison of `text` is not possible without checking on a real index.

## Goals / Non-Goals

**Goals:**
- Send only new and changed records, with the source of truth for comparison being the index itself.
- The comparison logic is covered by tests without the network.
- Degrade to "send everything", not to skipping changes.

**Non-Goals:**
- Deleting "orphaned" records.
- A local manifest or a cache between runs.
- Changing the id scheme or the `faq.sample.json` format.

## Decisions

**1. Compare one `content_hash` field, not five fields.**
Each record gets a metadata field `content_hash` (sha256, hex) of the normalized JSON `[embeddedText, answer, lang, type, project ?? null]`. Metadata is guaranteed to be returned by `fetch`, while returning `text` is not guaranteed. A record without `content_hash` (old records) is automatically treated as changed.
- Alternative: compare the fields directly. Simpler, but if `text` is not returned, every record is always "changed" and the feature does not work. The hash avoids this.
- Alternative: a local manifest `id → hash`. Diverges from the index after it is recreated or seeded from another machine.

**2. Module `scripts/seed-lib.js`.**
Extracted are `toRecords`, `contentHash`, `diffRecords(records, existing)` (a pure function → `{ toSend, newCount, changedCount, unchangedCount }`) and `fetchExisting(index, ids)` (batches of 100, accepts any object with a `fetch` method). `seed-pinecone.js` stays the entry point: arguments, env, the sending loop. The module lives in `scripts/`, not `src/`, because it is not server code.
- Alternative: test by running the script. The script executes on import, so a split is needed.

**3. Dry-run depends on the keys being present.**
If `PINECONE_API_KEY` and `PINECONE_INDEX_NAME` are set, `--dry-run` reads the index and prints the full summary (reading changes nothing). If not, it prints only the number of records, as now. No new flag is introduced.

**4. An index read error stops the seed.**
If `fetch` fails, the script exits with an error and does not silently fall back to a full upsert: this avoids unexpected embedding costs.

**5. Order and batch size.**
`fetch` by 100 ids (reduce if needed should the API reject the size), `upsertRecords` as before by 96. The filtered list is sent, and progress numbering is counted from its length.

## Risks / Trade-offs

- [The first run after the change will send all 310 records, because `content_hash` is not there yet] → expected, one-off, described in the README and proposal.
- [Inserting a question in the middle of `questions` shifts the numbers of the following chunks and those chunks are sent as changed] → the "add to the end" rule in the README. Correctness does not suffer, only extra embeddings.
- [The hash does not see changes made in the index by hand] → acceptable: the index is filled only by this script. To force an overwrite there is a simple way: delete the record in the index and it becomes "new".
- [Changing the hash formula will force sending everything] → the formula is pinned by a test and must be changed deliberately.
- [`fetch` returns something other than expected on the real index] → task 1.1 checks this manually before the rest of the work. The fallback (no `content_hash` → send) does not let changes be lost.
  - Checked 2026-10-19 on the real index: `fetch` returns `metadata` with `answer`, `lang`, `parent_id`, `text`, `type` (`content_hash` is not there yet). `text` is returned, but the decision to compare a hash stays in force (returning `text` is not guaranteed by the contract). A missing id does not appear in `records`.

## Migration Plan

1. Deploy the script change (nothing needs deploying, the script runs locally).
2. Run `npm run seed` once: all records get `content_hash`.
3. After that `npm run seed` sends only deltas. Rollback: restore the previous version of the script; the extra `content_hash` field harms no one.
