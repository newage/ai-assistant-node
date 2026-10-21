# frontend — personal site and `POST /chat`

The whole deployable part of the project: static files (`public/`), the Node chat service (`src/`), dependencies and tests. Only this folder is deployed to Vercel (Root Directory = `frontend`), with no Docker and no CI.

```
public/index.html        static page, served at the site root
src/index.js             Express app (default export, Vercel entrypoint)
src/local.js             local run: express.static('public') + listen
src/*.js                 config, log, messages, validate, rate-limit, retrieval, claude
scripts/seed-pinecone.js fills the Pinecone index from ../data/faq.sample.json
test/                    Jest
```

## How `POST /chat` works

Request `{"messages":[{"role":"user","content":"...","lang":"uk"}]}` (`lang`: `uk`/`en`/`pl`, otherwise `en`), response `{"reply":"..."}`. Only the last message is processed.

Pipeline: call limit → body parse → validation → Pinecone search (hits with `score >= VECTOR_MIN_SCORE`, grouped by `parent_id`) → optional rerank of the groups (`RERANK_MODEL`, groups with rerank score `>= RERANK_MIN_SCORE`) → one Claude call with only the retrieved context.

| Status | When | Body |
|---|---|---|
| 200 | an answer, or no relevant data (fixed text, Claude is not called) | `{reply}` |
| 400 | empty `content`, last role is not `user`, not JSON | `{error}` |
| 400 | too many messages / `content` too long | `{reply}` |
| 429 | more than 20 calls per 10 min from one IP | `{reply}` |
| 502 | Pinecone or Claude failure (reason in the log) | `{reply}` |

Questions that got no answer (no data, 502, 500) are also written to the `reactions` table before the response (`answer` = the no-data text, or `NULL` for failures; `reaction` is `NULL`). A database error is only logged and never changes the response.

## `POST /answer`

Reaction of a visitor to a bot answer: `{"question":"...","answer":"...","reaction":"good"|"bad"}` → one row in `reactions`. No call limit in code (use a Firewall rule, see Deploying).

| Status | When | Body |
|---|---|---|
| 201 | stored | `{}` |
| 400 | not a JSON object, `question`/`answer` empty, `question` longer than `MAX_MESSAGE_CHARS`, `answer` longer than `MAX_ANSWER_CHARS`, `reaction` not `good`/`bad` | `{error}` |
| 503 | `DATABASE_URL` is empty | `{error}` |
| 500 | the write failed | `{error}` |

The chat page shows 👍/👎 under every answer (not under the greeting or failure text); only a 201 highlights the choice.

## Environment variables

The template is `.env.example`; locally a copy in `.env` (not committed to git), on Vercel — in the project settings.

| Variable | Purpose |
|---|---|
| `ANTHROPIC_API_KEY` | Anthropic key |
| `CLAUDE_MODEL`, `CLAUDE_MAX_TOKENS` | model and output token limit |
| `CLAUDE_EFFORT` | `low`…`max`; empty — not sent |
| `MAX_MESSAGES`, `MAX_MESSAGE_CHARS` | request size limits |
| `VECTOR_MIN_SCORE`, `VECTOR_TOP_K` | relevance threshold and number of hits; with the reranker on, `VECTOR_MIN_SCORE` is only a coarse prefilter (lower it, ~0.75) |
| `RERANK_MODEL`, `RERANK_MIN_SCORE` | Pinecone rerank model (empty = reranker off, the default) and the minimum rerank score of a kept group |
| `PINECONE_API_KEY`, `PINECONE_INDEX_NAME` | index access |
| `PINECONE_TEXT_FIELD`, `PINECONE_NAMESPACE` | seed field; namespace (empty = `__default__`) |
| `DATABASE_URL` | Neon connection string for `reactions`; empty — `/answer` returns 503 and the migration fails |
| `MAX_ANSWER_CHARS` | max length of `answer` in `POST /answer` (default 4000) |
| `ENVIRONMENT` | `production` disables stage logs in `console.log` |

## Commands

```bash
cd frontend
cp .env.example .env     # fill in the keys
npm ci
npm run seed -- --dry-run   # show new/changed/unchanged vs the index (310 records without keys), writes nothing
npm run seed                # send only new and changed records to Pinecone
npm run dev                 # http://localhost:3000
node --env-file=.env scripts/migrate.js   # create the `reactions` table (idempotent)
npm test                    # all tests
npm test -- test/validate.test.js # a single file
```

Locally via Docker: `docker compose -f docker/docker-compose.yml up` (from the repository root). The container runs `npm install && npm run dev` itself.

Locally (outside Vercel) the call limit is disabled.

## Pinecone index

An index with integrated embedding: `field_map` must point to the `text` field. Each FAQ item has 1 + N chunks with the same `parent_id` and `answer`. The index is created manually, then `npm run seed`.

`npm run seed` is incremental: it reads the existing records by id and sends only new and changed ones, printing e.g. `3 new, 1 changed, 247 unchanged`. Each record carries a `content_hash` (embedded text, `answer`, `lang`, `type`, `project`) that is compared with the stored one. Records seeded before this field existed are treated as changed, so the first run sends everything (310). If reading the index fails, the script exits without sending anything.

- Add new questions to the **end** of `questions`: ids are positional (`<parent_id>-NN`), so inserting in the middle shifts the following chunks and they are re-sent.
- Deleting is not supported: a record removed from the JSON stays in the index. Remove it manually (Pinecone console, or `index.deleteOne({ id })`). Deleting a record also forces it to be re-sent on the next seed.

## Deploying to Vercel

1. Connect the GitHub repository, **Root Directory** = `frontend`, Framework Preset "Other". The build command is the `vercel-build` script: it runs `scripts/migrate.js` (creates `reactions` if missing) and fails the deploy if the database is unreachable, so the previous version stays live.
2. Settings → Build and Deployment → **Ignored Build Step** = "Only build if there are changes in a folder", value `frontend`.
3. Add the variables from `.env.example` to the project settings. `DATABASE_URL` must be enabled for **Build** too. Use a separate Neon branch for Preview (or set `DATABASE_URL` for Production only, in which case a Preview build fails at the migration) so previews do not touch production data.
4. Firewall: a rule with a `@vercel/firewall` condition, Rate limit ID `chat`, fixed window 600 s, 20 requests, key — IP. Optionally a similar rule for `/answer` (Rate limit ID of your choice) to limit spam to the table.
5. Verify on a preview deployment: `GET /` serves the page, the chat answers, the 21st call within 10 min → 429, and `/src/index.js`, `/package.json`, `/.env` are not served.

After that every push deploys by itself. Rollback — Instant Rollback or `CHAT_API_URL = null` in `public/index.html` (demo mode). The limit is approximate (counters are per region).

## Manual check (local, real Pinecone and Claude)

After `npm run seed` (310 records) and `npm run dev`, `POST /chat`:

| Request | Result |
|---|---|
| `Who is Vadym Leontiev?` (en) | 200, answer based on `profile-summary` (top score ≈ 0.91) |
| `Де Вадим працював 13 років?` (uk) | 200, answer in Ukrainian about Englishdom (top score ≈ 0.87) |
| `What is the capital of France?` (pl) | 200, fixed "no information" text in Polish, Claude not called (no hit ≥ 0.84) |
| `content` of 201 characters | 400 `{reply}` "message too long" |

## Reranker (optional, off by default)

Set `RERANK_MODEL` (e.g. `bge-reranker-v2-m3`) and `RERANK_MIN_SCORE` to rerank the groups that passed `VECTOR_MIN_SCORE` against the question. A rerank failure gives 502 (no silent fallback to dense scores). To roll back, clear `RERANK_MODEL`.

Calibrate thresholds with `npm run measure-score` (dense distribution; with `RERANK_MODEL` set it also prints the rerank distribution and a suggested `RERANK_MIN_SCORE`). Pinecone limits rerank calls (free plan: 60 per minute, 500 per month per organization; one full run is ~330 calls), and the model must be available on your plan (`cohere-rerank-4-fast` is not on the free plan). On the data in `data/faq.sample.json`, `bge-reranker-v2-m3` separated off-topic queries well but scored ~10% of in-topic queries near 0, so no threshold was set; see `openspec/changes/add-reranker/design.md`.
