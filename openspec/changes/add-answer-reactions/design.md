# Design

## Context

Observed: `POST /chat` in `frontend/src/index.js` builds the app through `createApp(deps)` with injected `log`, `isRateLimited`, `search`, `answer`; Pinecone/Claude failures go through `upstreamFailure` (502), unknown errors through the error handler (500), "no data" returns 200 inline. External clients live in their own modules created lazily (`retrieval.js`) and are faked in Jest (`test/chat.test.js`). Config is one `loadConfig` in `config.js` mirrored in `.env.example`. There is no database and no build step; Vercel deploys `frontend/` with `installCommand` in `vercel.json`. The page keeps `history` and renders messages through `addMessage` / `send` in `public/index.html`. See proposal.md for motivation.

## Goals / Non-Goals

**Goals:**
- One table and one writer for both user reactions and unanswered questions.
- `/chat` behaviour for the visitor stays the same; a DB problem is only logged.
- Reaction UI never blocks the dialogue.

**Non-Goals:**
- Changing or removing a reaction after it is sent (the contract has no row id).
- Reading the table (no admin view).
- Code-level rate limiting of `/answer` (a Vercel Firewall rule, set outside the code).

## Decisions

**Writer module `src/db.js`.** `createDb(config)` returns `{ record }` where `record({ question, answer, reaction })` inserts one row; the Neon client is created lazily on first use (no connection at import), following `retrieval.js`. Values go through the Neon tagged-template `sql` call, so they are always bound parameters. With empty `DATABASE_URL`, `record` throws a typed "not configured" error. `createApp` takes it as `deps.record`, so tests inject a fake.
- Alternative: `pg` pool — rejected, the developer chose `@neondatabase/serverless`, and HTTP queries suit stateless Vercel functions.

**`/chat` logging helper.** A small `logUnanswered(question, answer)` in `index.js` awaits `record`, catching and logging errors. It is awaited before the response because a Vercel function is frozen after responding. Called in three places: no-data branch (`answer` = the fixed text), `upstreamFailure` (`answer` null) and the error handler. The question is known there only after validation, so it is kept in a variable of the request (`req.question`) set after `validate`; the error handler records only when it is set.
- Alternative: record in a response `finish` hook — rejected, runs after the function may be frozen.

**`POST /answer`.** No rate-limit call (not in the contract). Body parsed with `express.json()`; a parse error gives 400 (no deferral trick needed, there is no limiter before it). Validation lives in a new pure function in `validate.js` (`validateReaction(body, config)`) returning `{status, body}` or the checked values, like `validate`. Status mapping: valid → 201 `{}`; invalid → 400 `{error}`; not configured → 503; write error → 500, logged. `answer` is required here (null only in server-written rows).

**Config.** `databaseUrl` (`DATABASE_URL`) and `maxAnswerChars` (`MAX_ANSWER_CHARS`, default 4000) in `config.js` and `.env.example`.

**Table.** `scripts/schema.sql`: `CREATE TABLE IF NOT EXISTS reactions (id bigserial primary key, question text not null, answer text, reaction varchar(20) check (reaction in ('good','bad')), dt_created timestamptz not null default now())`. The decision log's assumptions mention `'error'` in the CHECK, but its decision section revokes `reaction='error'` — the CHECK allows only `good`/`bad` (NULL passes a CHECK).

**Migration.** `scripts/migrate.js` reads `schema.sql` and executes it through the Neon client; exported helper that reads the SQL file is unit-tested (like `seed-lib.js`), the script body is thin. Wired in as `"vercel-build": "node scripts/migrate.js"` in `package.json`; no separate npm command and no `--dry-run`. Locally: `node --env-file=.env scripts/migrate.js`, documented in README. A failure exits non-zero, which fails the Vercel build, and the previous deployment stays live. If `vercel-build` exists, Vercel uses it instead of "no build command".
- Alternative: manual run once per environment — rejected by the developer.
- Alternative: create the table lazily on the first write — rejected, adds DDL to the request path.

**Frontend.** In `send`, remember the question; after adding a bot reply for a real answer (not the failure text in the `catch`, not the greeting) append a small row with two buttons to that message. A click disables that pair, calls `fetch(POST /answer)` with an `AbortController` (~10 s), and on `201` marks the button pressed and leaves both disabled; otherwise re-enables them. Other UI is untouched while it waits. The `noData` text is an ordinary reply from `/chat`, so it gets buttons without special casing. Fixed UI strings (aria labels) follow the page's existing `t()` mechanism. No frontend tests (no infrastructure).

## Risks / Trade-offs

- [Spam to `/answer` fills the table] → validation and length limits; a Firewall rate-limit rule is set manually on Vercel (documented).
- [Preview deploys run the migration and write to the production DB] → separate Neon branch for Preview or `DATABASE_URL` for Production only (README); with the variable absent the build must not silently succeed on a Production deploy — `migrate.js` fails when `DATABASE_URL` is empty.
- [Awaiting the write adds latency to `/chat` error/no-data paths] → one small HTTP query; accepted so the row is not lost to function freezing.
- [`answer` sent by the client is not verified against what the bot said] → accepted; the endpoint is a public feedback log, not a source of truth.
- [`/chat` build step is a new failure point for deploys] → migration is idempotent and fast; failure keeps the old version live.

## Migration Plan

1. In Vercel/Neon: create the Neon DB (integration adds `DATABASE_URL`), enable it for Build, use a separate branch for Preview.
2. Deploy: `vercel-build` creates `reactions`, then the new version goes live.
3. Add the optional Firewall rate-limit rule for `/answer`.
4. Rollback: Instant Rollback; the table stays and is harmless to the old version.
