# Design

## Context

See `proposal.md` (Why) and `.agents/decisions/chat-endpoint.md` — the decision log. State at the start:
- There is no service code; the repository root has `package.json` (`"type": "module"`, `seed` script), `scripts/seed-pinecone.js`, `data/faq.sample.json`, `.env.example`, `frontend/index.html`.
- A Pinecone index with integrated embedding: the `text` field is embedded, `answer` is the original text; each FAQ item has 1 + N chunks with the same `parent_id`/`answer`.
- `frontend/index.html` currently sends `{message, history}` to `CHAT_API_URL` (default `null` — demo) and shows a generic error on non-2xx.
- Hosting is Vercel (Hobby). Cloudflare Workers was rejected: free Workers plans do not run a Node process/Express, and the rate limit would need a separate store.

## Goals / Non-Goals

**Goals:**
- One `frontend/` folder is the complete deployable artifact: static files, Node function, dependencies. Vercel deploys only it from GitHub, without Docker or CI.
- A pipeline of separate pure steps (limit → validation → search → grouping → Claude), each testable without the network.

**Non-Goals:**
- Dialog history, streaming, CORS, authentication, changes to seed data and logic.

## Decisions

**Repository layout.**
```
frontend/                 ← Vercel project Root Directory
  public/index.html       ← static, served at the site root
  src/index.js            ← Express app, default export (Vercel entrypoint)
  src/local.js            ← local run: express.static('public') + listen
  src/*.js                ← config, validate, rate-limit, retrieval, claude, messages, log
  scripts/seed-pinecone.js
  test/                   ← node:test
  package.json, .env.example
data/faq.sample.json      ← stays at the root (data, not part of the deploy)
```
Static files must live in `public/`: on Vercel `express.static()` is ignored, and serving the `frontend/` root is not allowed — `src/`, `package.json` and `.env` would end up there. This rejects the earlier "index.html directly in `frontend/`"; on the host `index.html` is still at the site root. The seed script moves to `frontend/scripts/` so it sees the same dependencies; the default data path is `../data/faq.sample.json`.

**Hosting: Vercel Hobby.** Root Directory = `frontend`, Framework Preset "Other", no build command; every push to GitHub is an automatic deploy. Docker is not needed. Limits (from the docs): full Node.js, 300 s per call, 2 GB; waiting on Pinecone/Claude does not count as active CPU. The Hobby terms on commercial use should be checked separately.

**Web framework: Express, default export in `src/index.js`** (zero-config on Vercel — becomes a single function; `app.listen` is not needed in the function). The alternative is separate `api/*.js` files without a framework: fewer dependencies, but body parsing and errors by hand. Locally `src/local.js` adds `express.static('public')` and `listen`, so it does not depend on `vercel dev`.

**Rate limit: Vercel Firewall + `@vercel/firewall`.** In the Vercel dashboard a rule is created with the `@vercel/firewall` condition and Rate limit ID `chat`: fixed window 600 s, 20 requests, key — IP (default). In code `checkRateLimit('chat', { request })` is the first step of the pipeline; on `rateLimited` the service itself returns 429 `{reply}` with a localized text. Alternatives: (1) a WAF rule without a call in code — Vercel itself would return the 429, not our `{reply}`; (2) Upstash Redis — exact 20/hour, but an extra service. Limitation: counters are kept per region, so the overall limit is approximate; the maximum window on Hobby is 10 min, hence "20 per 10 min". Hobby allows one rule per project. Locally (without Vercel) the limit check is disabled: `checkRateLimit` is wrapped in the `rate-limit.js` module with a replacement in tests and a no-op outside Vercel.

**Processing order: limit → body parsing → validation.** The limit is the first step; `lang` for the 429 is taken from the body if `express.json` parsed it, otherwise `en`. A JSON parse error gives 400 `{error}`, not 500.

**Search: `index.searchRecords({ query: { topK: VECTOR_TOP_K, inputs: { text } }, fields: [parent_id, answer] })`** in the namespace from `PINECONE_NAMESPACE`; score is the hit's `_score`. Grouping: a `Map` by `parent_id` with the maximum score, sorted in descending order.

**Claude: `@anthropic-ai/sdk`, one `messages.create`** with a constant `system` and one user message: `search_result` blocks (one per group: `source`/`title` = `parent_id`, `content` = `[{type:'text', text: answer}]`) + a `text` block with the question. `model`/`max_tokens` come from env; `output_config.effort` only if `CLAUDE_EFFORT` is not empty. The answer is the concatenation of `text` blocks. Before implementing, check the `search_result` type in the installed SDK version.

**Fixed texts.** A single `messages.js` dictionary (`tooLong`, `noData`, `rateLimited`, `failure`) × `uk/en/pl`; invalid `lang` → `en`. The `failure` (502) text is not set in the log — "Something went wrong, please try later" is proposed (Open Questions).

**Upstream errors → 502.** A Pinecone or Claude error/timeout is wrapped in one type; the cause goes to the log, the client gets `{reply}`. Retries are only the SDK's built-in ones. An Express error handler is required (without it Express catches errors and does not let Vercel reset the function).

**Logging.** `log(stage, data)` → `console.log(JSON.stringify({stage, ...}))` only when `ENVIRONMENT !== 'production'`; keys are not logged.

**Frontend.** A minimal change to `public/index.html`: `CHAT_API_URL = '/chat'`; the request is always `POST /chat` with `{"messages":[{"role":"user","content":"<user message>","lang":"<page language>"}]}` — one element, no history is sent. `lang` is the existing page variable (`uk`/`en`/`pl`). `reply` is read for non-2xx too (400/429/502); a generic error only when the body cannot be parsed. The relative `/chat` works because the page and the function share one origin.

**Deploy.** Connect the GitHub repository in Vercel, Root Directory `frontend`, Ignored Build Step "Only build if there are changes in a folder" = `frontend` (changes outside the folder do not trigger a deploy), environment variables from `.env.example` in the project settings, the Firewall rule `chat`. After that every push to the production branch deploys on its own; GitHub Actions and Docker are not needed. `.env` lives locally in `frontend/` and does not go into git.

## Risks / Trade-offs

- [The index was not created with `field_map` on `text`, or was not seeded] → the first request gives 502/an empty result; the README has the `npm run seed` step and a manual request.
- [`VECTOR_MIN_SCORE=0.84` was tuned for a different embedding model] → may cut off relevant results; tune on real queries.
- [The limit is approximate: counters per region, one rule on Hobby] → acceptable for a portfolio; more exact is Upstash Redis (out of scope).
- [The `chat` rule is not created in the Vercel dashboard] → `checkRateLimit` does not limit requests; creating the rule is a separate task with a manual check (21st call → 429).
- [Hobby — commercial-use terms] → check before launch.
- [`public/` misconfiguration → server code served as static] → the "Server code is not public" spec scenario and a manual check after deploy.
- [Model invention despite the instruction] → score filter + system prompt; checked manually.

## Migration Plan

1. Move `package.json`/lock, `scripts/`, `.env.example` into `frontend/`, `index.html` → `frontend/public/` (`git mv`).
2. Create the Pinecone index with `field_map` on `text`, run `npm run seed` from `frontend/`.
3. Locally: `npm run dev`, check `GET /` and `POST /chat` manually.
4. Vercel: connect the repository (Root Directory `frontend`), add env, create the Firewall rule `chat`; check on a preview deploy, then production. Rollback — Instant Rollback in Vercel or `CHAT_API_URL = null` (demo mode).

## Open Questions

- The 502 reply text in three languages is not approved — proposed in `messages.js`, to be checked during apply (does not change the spec).
- The production branch and domain for Vercel (does not affect the code).
