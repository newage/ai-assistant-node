# Decision log: answer reactions and a log of unanswered questions

## Problem
The site owner can't see whether the bot's answers are useful, and doesn't know which questions the bot failed to answer (a failure, or no data in the knowledge base). Without this, the Pinecone FAQ gets filled in blindly.

## Given
- `POST /chat` → `{reply}`; Pinecone/Claude failures → 502 with the `failure` text, unknown error → 500 — verified: `frontend/src/index.js` (`upstreamFailure`, error handler)
- The "no data" case → 200 with the `noData` text, Claude is not called — `frontend/src/index.js`
- The frontend knows the `question` and `reply` when it renders them — `frontend/public/index.html` (`send`, `addMessage`)
- There is no database and no Neon dependency; config goes through `config.js` + `.env.example` — `frontend/package.json`, `frontend/src/config.js`
- Tests: Jest with no network, dependencies are replaced via `createApp(deps)` — `frontend/test/chat.test.js`
- The `/chat` rate limit is a Vercel Firewall rule with id `chat` — `frontend/README.md`
- Contract from the user — `.agents/propose/answer.md`

## Solution concept
**Chosen:** after a click on 👍/👎, the client sends `POST /answer` `{question, answer, reaction: good|bad}`; the backend writes a row to the `reactions` table (Neon, `@neondatabase/serverless`). The backend calls the same logging mechanism itself from `/chat` for unanswered questions.
**Whose idea:** proposed by the developer (`.agents/propose/answer.md`)
**Why:** one table and one writer cover both needs with the fewest new parts.
**Rejected:** no alternatives were considered; the developer supplied a complete contract (a deviation from the funnel norm, accepted deliberately).

## Flow
```
Browser ── POST /chat ──▶ pipeline ──▶ 200 reply
   │                         │ 502/500 (failure) ──▶ INSERT reactions(question, NULL, NULL)      ─┐ before the response is sent
   │                         │ 200 noData        ──▶ INSERT reactions(question, noDataText, NULL) ─┘
   └─ click 👍/👎 ── POST /answer {question, answer, reaction} ──▶ INSERT ──▶ 201 ──▶ highlight the button, lock both
                                                         not 201 ──▶ UI unchanged
```
- A reaction is optional; buttons appear under every bot message that is an answer, including `noData`; they are not shown under the greeting or under an error text (there is no answer).
- All SQL values are passed only as parameters (Neon tagged template), no concatenation; plus input validation.
- A DB write error on `/chat` does not break the reply to the user (it is only logged).

## Details
### What to log as "unanswered"
**Decision:** failures (502/500) → `answer=NULL`, `reaction=NULL`; `noData` → `answer` = the `noData` text, `reaction=NULL`. A row without a reaction = an unanswered question; a failure differs from noData in that `answer IS NULL`.
**Why:** `reaction` is only good|bad (the developer's decision), so error/no_data values don't go there; FAQ gaps and failures are told apart by `answer`.
**Changed:** it was previously `reaction='error'|'no_data'` — withdrawn on the developer's instruction.
**Alternative:** log only failures or only noData — one of the two signals is lost.

### Clicking a reaction again
**Decision:** after a 201, both buttons are locked, one row per answer.
**Why:** the contract doesn't return an id, so a row can't be changed; duplicate rows in the table are undesirable.
**Alternative:** allow changing the reaction (duplicate rows) or a toggle with upsert (needs an id in the response).

### Non-blocking client
**Decision:** the `/answer` request is asynchronous and doesn't block the chat: the input field, sending new questions and other buttons work while it waits. Only the button pair for that message is locked (protection against double-clicks). The highlight appears only after a 201; on an error, a non-201 response or a timeout (`AbortController`, ~10 s) the UI is unchanged and the buttons are active again.
**Why:** a developer requirement; a reaction is a secondary action and must not get in the way of the conversation.

### Neon migration and connection
**Decision:** the migration script `frontend/scripts/migrate.js` (the only way to run it is automatic; there is no separate npm command for manual runs) executes `frontend/scripts/schema.sql` containing `CREATE TABLE IF NOT EXISTS reactions` — re-running is safe. Connection: `@neondatabase/serverless` (`npm install`), the connection string is in `DATABASE_URL` (`config.js` + `.env.example`; on Vercel — in the project variables, usually added by the Neon integration). The connection is created in a separate module `src/db.js` (following the `retrieval.js` pattern), with no connection at import time; on Vercel the script runs automatically on deploy via the `vercel-build` script in `package.json` (`node scripts/migrate.js`, variables are taken from the build environment). Local DB: the same script creates the table if the developer runs it themselves (`node --env-file=.env scripts/migrate.js`); we don't add a separate npm script for it. Add instructions to `frontend/README.md`.
**Why:** a developer requirement; there's no manual step to remember. A failed migration stops the deploy and the old version stays live.
**Conditions:** `DATABASE_URL` must be enabled for Build; the migration is idempotent (it runs on every deploy); preview deploys must not touch the production DB — a separate Neon branch for Preview, or a variable for Production only (configured on the Vercel/Neon side). Update the "no build step" rule in `CLAUDE.md` and `frontend/README.md`.
**Alternative:** run it manually once per environment — rejected by the developer.
**Test:** cover the SQL-reading logic with Jest without network; no `--dry-run`.

## Open questions
- Spam protection: the Firewall rule for `/answer` is configured on the Vercel side (outside the code). In code there is only validation.

## Assumptions
- Table: `id` bigserial PK, `question` text NOT NULL, `answer` text NULL, `reaction` varchar(20) NULL with CHECK (`reaction IN ('good','bad','error')`), `dt_created` timestamptz NOT NULL DEFAULT now(). A row with `reaction IS NOT NULL` = a user reaction. DDL — `frontend/scripts/schema.sql` + an npm script; `DATABASE_URL` in `.env.example`. Not blocking.
- `/answer` validation: the body is a JSON object; `question` and `answer` are non-empty strings, `question` ≤ `MAX_MESSAGE_CHARS`, `answer` ≤ a length limit (new env variable, default e.g. 4000); `reaction` ∈ {good, bad}; invalid → 400. For `/answer`, `answer` is required (NULL only in server-written rows without an answer).
- If `DATABASE_URL` is empty: the write is skipped, `/answer` returns 503; `/chat` works as before. Not blocking.
- The DB write in `/chat` is `await`ed before the response (the Vercel function is "frozen" after the response), and its error is caught and logged.
- Tests (Jest, no network, fake writer via `createApp(deps)`): `/answer` validation (400 cases), 201 on valid input, 503 without a DB, row writes on failures/noData in `/chat`, a write failure doesn't break `/chat`, parameterized writer call; no frontend test is needed (no infrastructure).
