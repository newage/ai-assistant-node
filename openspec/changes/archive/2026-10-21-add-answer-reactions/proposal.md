# Proposal

## Why

The site owner can't see whether the bot's answers are useful, or which questions it failed to answer (an upstream failure or no data in the knowledge base). Without this the FAQ in Pinecone is extended blindly.

## What Changes

- Under every bot answer in the chat, two small buttons (👍 / 👎). Choosing is optional. A click sends `POST /answer` with `{question, answer, reaction}`; on `201` the chosen button is highlighted and both are disabled, on any other outcome the UI stays as it was.
- New endpoint `POST /answer` that validates the body and writes one row into a new Neon table `reactions`.
- Questions that got no answer are logged into the same table by the backend, before the response is sent: upstream failures (502/500) with `answer = NULL`, "no data" (200) with `answer` = the fixed no-data text. `reaction` stays `NULL` for these rows.
- Neon connection via `@neondatabase/serverless` in a new `src/db.js`, configured by `DATABASE_URL`. A DB write failure never breaks `/chat`.
- Idempotent migration script (`scripts/migrate.js` + `scripts/schema.sql`) run automatically on Vercel through the `vercel-build` script. **BREAKING** for the deploy docs: the "no build step" rule in `CLAUDE.md` and `frontend/README.md` no longer holds.

## Capabilities

### New Capabilities
- `answer-reactions`: user 👍/👎 reactions on bot answers — `POST /answer` contract and validation, the `reactions` table, non-blocking UI behaviour, schema migration on deploy.

### Modified Capabilities
- `chat-answering`: `POST /chat` additionally records unanswered questions (upstream failure, no data) in `reactions` before responding, without changing its response contract.

## Impact

- Code: `frontend/src/index.js`, new `frontend/src/db.js`, `frontend/src/config.js`, `frontend/public/index.html`, new `frontend/scripts/migrate.js` and `schema.sql`, `frontend/package.json` (dependency + `vercel-build`), `frontend/.env.example`.
- Tests: new Jest cases with a fake DB writer via `createApp(deps)`; no network.
- Docs: `frontend/README.md` (migration, `DATABASE_URL`, build step, `/answer`), `CLAUDE.md` (build-step rule).
- Dependency: `@neondatabase/serverless`.
- Outside the code: `DATABASE_URL` enabled for Build on Vercel, a separate Neon branch (or Production-only variable) so previews don't touch production data, and an optional Firewall rate-limit rule for `/answer`.
- Out of scope: changing a reaction after it is sent, an admin view of the table, a rate limit in code for `/answer`.
