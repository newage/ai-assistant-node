# Tasks

## 1. Checking assumptions about Pinecone

- [x] 1.1 On the real index (`.env`) run a one-off script in the scratchpad: `index.fetch({ ids: ['profile-summary-01'] })`; check that `records[id].metadata` contains `answer`, `lang`, `type`, and whether `text` is returned. Verification: the result is recorded in a note in design.md (Risks). Project files are not changed.

## 2. Seed module and tests

Boundaries: we touch only `frontend/scripts/seed-pinecone.js`, the new `frontend/scripts/seed-lib.js`, the new `frontend/test/seed-lib.test.js`. We do not touch `src/`, `data/`, `public/`.

- [x] 2.1 Create `frontend/scripts/seed-lib.js`: move `toRecords` from `seed-pinecone.js` without changing the id/field logic; add `content_hash` (sha256 of the JSON `[embedded, answer, lang, type, project ?? null]`) to each record. Verification: `node --test test/seed-lib.test.js` (ids `a-01..`, `answer` in all chunks, `project` absent when `null`, duplicate ids → error).
- [x] 2.2 Add a pure `diffRecords(records, existing)` to `seed-lib.js` → `{ toSend, newCount, changedCount, unchangedCount }`; a missing record = new, a missing or different `content_hash` = changed. Verification: tests for the spec scenarios "nothing changed", "new question at the end", "text changed → all item chunks", "lang changed", "old record without hash", "removed question has no effect".
- [x] 2.3 Add `fetchExisting(index, ids)`: batches of 100 via `index.fetch({ ids })`, collects `records` into an `id → metadata` map. Verification: a test with a fake `index` (250 ids → 3 calls; responses are merged; a fetch error propagates up).

## 3. Entry script

- [x] 3.1 Rewrite `frontend/scripts/seed-pinecone.js` on top of `seed-lib.js`: read the JSON, build the records, if keys are present read the index and compute the diff, print `N new, M changed, K unchanged`, send only `toSend` in batches of 96. Without keys and with `--dry-run`: print the number of records as before. Verification: `npm run seed -- --dry-run` without `.env` prints `310 records ...`, `npm test` is green.
- [x] 3.2 A `fetch` error ends the script with a non-zero code without an upsert; there is no deletion in the script. Verification: review of the script diff + a test of `fetchExisting` with an error (2.3).
- [x] 3.3 Manual check on the real index: the first `npm run seed` sends 310 (all "changed"), the second prints `0 new, 0 changed, 310 unchanged` and sends nothing, and after adding one question to the end of `questions` in `data/faq.sample.json` the third sends exactly 1 record. Verification: the output of the three runs; the test question is then removed from the JSON.

## 4. Documentation

- [x] 4.1 Update `frontend/README.md` (the seed section, the lines about `--dry-run` and `npm run seed`): incremental behavior, the summary, the first run sends everything, add new questions to the end of `questions`, deleting records is not supported (how to remove manually). Verification: the described commands run as written, the number of records in the README matches the dry-run output.
