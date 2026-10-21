# Tasks

Boundaries: touch only `frontend/` (plus `CLAUDE.md` for the build-step rule). Do not touch `frontend/src/{retrieval,claude,rate-limit,messages,log}.js`, the Pinecone seed scripts, or `openspec/specs/`. Server code must not go under `public/`.

## 1. Dependency, config, schema, migration

- [x] 1.1 `cd frontend && npm install @neondatabase/serverless`; verify it appears in `dependencies` of `frontend/package.json` and `npm test` still passes.
- [x] 1.2 In `frontend/src/config.js` `loadConfig` add `databaseUrl: str(env.DATABASE_URL)` and `maxAnswerChars: num(env.MAX_ANSWER_CHARS, 4000)` (same style as neighbours); add both to `frontend/.env.example` with a one-line comment; extend `frontend/test/config.test.js` for defaults and overrides and verify it passes.
- [x] 1.3 Create `frontend/scripts/schema.sql` with `CREATE TABLE IF NOT EXISTS reactions (...)` exactly as in design.md (CHECK only `good`/`bad`); verify by reading it back against the "Reactions table" requirement.
- [x] 1.4 Create `frontend/scripts/migrate.js` (thin script, SQL-file reading in an exported helper in the style of `scripts/seed-lib.js`): exits non-zero with a message when `DATABASE_URL` is empty or execution fails, otherwise runs `schema.sql` via the Neon client. Add `"vercel-build": "node scripts/migrate.js"` to `package.json`; do NOT add a separate npm script or `--dry-run`. Add a Jest test (no network) for the SQL-reading helper and verify `npm test -- test/migrate` passes.
- [ ] 1.5 Verify against a real Neon branch: `node --env-file=.env scripts/migrate.js` twice — second run succeeds and `\d reactions` shows the columns and CHECK.

## 2. Writer and `POST /answer`

- [x] 2.1 Create `frontend/src/db.js` with `createDb(config)` → `{ record }` following the lazy-client pattern of `src/retrieval.js` (no connection at import); the insert uses the Neon tagged-template call only, no string concatenation; empty `databaseUrl` throws a "not configured" error. Test with a fake client injected as in `test/retrieval.test.js`: the insert is parameterised, no connection is made at import.
- [x] 2.2 Add `validateReaction(body, { maxMessageChars, maxAnswerChars })` to `frontend/src/validate.js` in the style of `validate`, per "Reaction request validation"; cover each 400 case and the valid case in `frontend/test/validate.test.js`.
- [x] 2.3 In `frontend/src/index.js` take `deps.record ?? createDb(config).record` and add `POST /answer` (own `express.json()` parse, 400 on bad JSON) returning 201 / 400 / 503 (not configured) / 500 (write error, logged). Do not call the rate limiter. Test in `frontend/test/chat.test.js` or a new `test/answer.test.js` with a fake `record`: 201 on valid, 400 cases write nothing, 503 without DB, 500 on write error, `record` called with the exact values.

## 3. Logging unanswered questions in `/chat`

- [x] 3.1 In `frontend/src/index.js` add `logUnanswered(question, answer)` (awaits `record`, catches and logs errors) and call it: in the no-data branch with the `noData` text, in `upstreamFailure` and in the error handler with `answer` null (error handler only when the question was validated — keep it on `req`). Call sites stay `await`ed before the response. Do not change response bodies or statuses.
- [x] 3.2 Extend the `/chat` tests with a fake `record`: no-data writes `(question, noDataText, null)`; Pinecone failure and Claude failure write `(question, null, null)` before 502; 400 and 429 write nothing; a throwing `record` leaves the response unchanged (200 no-data / 502). Verify `npm test` passes.

## 4. Chat UI

- [x] 4.1 In `frontend/public/index.html`, near `addMessage`/`send`: add CSS for a small reaction row inside `.msg.bot`, and after a real reply in `send` append the 👍/👎 buttons (not for the greeting at the `GREETING` push, not for the failure text in the `catch`). Aria labels through the page's `t()`.
- [ ] 4.2 Click handler per message: disable only its pair, `fetch` `POST /answer` with `{question, answer, reaction}` and an `AbortController` (~10 s); on 201 mark the clicked button and keep both disabled, otherwise re-enable. Must not block the input or other buttons. Verify manually with `npm run dev`: 201 highlights; stopping the DB (503) leaves buttons active; a slow request doesn't block typing; no buttons under greeting and error text; buttons appear under a no-data reply.

## 5. Docs and end-to-end check

- [ ] 5.1 Update `frontend/README.md` (env vars table/section for `DATABASE_URL`, `MAX_ANSWER_CHARS`; migration incl. the local command; the `/answer` contract; Vercel steps: `DATABASE_URL` enabled for Build, separate Neon branch or Production-only variable for previews, optional Firewall rule for `/answer`; replace "no build command"). Update the "no lint or build step" line in `CLAUDE.md`. Verify the documented local migration command runs as written.
- [ ] 5.2 End to end on a Preview deployment: react 👍 to an answer (row with `reaction='good'`), ask an off-topic question (row with `answer` = no-data text, `reaction IS NULL`), force a failure (row with `answer IS NULL`); verify via SQL, and that a deploy with a broken `DATABASE_URL` fails the build.
