# Tasks

Change boundaries: we touch `frontend/` (new composition: `public/`, `src/`, `scripts/`, `test/`, `package.json`, `.env.example`, `README.md`), `.gitignore`, `CLAUDE.md`. We move from the root: `package.json`/`package-lock.json`, `scripts/seed-pinecone.js`, `.env.example`, `frontend/index.html` → `frontend/public/`. **We do not touch:** `data/` (stays at the root), `openspec/specs/`, the markup and the demo `KB` answers in `index.html`, the seed logic (only the default data path).

## 1. Layout and skeleton

- [x] 1.1 Move into `frontend/` with `git mv`: `package.json`, `package-lock.json`, `scripts/`, `.env.example`; `frontend/index.html` → `frontend/public/index.html`; in the seed change the default path to `../data/faq.sample.json`; `.gitignore`: `frontend/node_modules/`, `frontend/.env`; verify: `cd frontend && npm ci && npm run seed -- --dry-run` prints 310 records, the repository root has no `package.json` or `node_modules`.
- [x] 1.2 Add to `frontend/package.json` the dependencies `express`, `@anthropic-ai/sdk`, `@vercel/firewall` and the scripts `dev` (`node --env-file=.env src/local.js`), `test` (`node --test`); verify: `npm install`, `npm test` (empty run) without errors.
- [x] 1.3 Create `src/config.js`: reads env from `.env.example` (`VECTOR_TOP_K` defaults to 10), empty values → defaults, numbers are parsed; verify `test/config.test.js` (defaults, empty `CLAUDE_EFFORT`).
- [x] 1.4 Create `src/log.js` (JSON to `console.log`, nothing when `ENVIRONMENT=production`); verify with a test that replaces `console.log`.

## 2. Texts and validation

- [x] 2.1 Create `src/messages.js`: `tooLong`, `noData`, `rateLimited`, `failure` × `uk/en/pl` (texts from `design.md` and `.agents/propose/setup.md`), `resolveLang(lang)` with an `en` fallback; verify with a test: all 12 texts are non-empty, `de`/`undefined` → English.
- [x] 2.2 Create `src/validate.js` per the `chat-answering` requirements (Request validation, Message length limits): returns `{status, body}` or `{question, lang}`; verify `test/validate.test.js` by scenario: empty `content` → 400 `{error}`, last role not `user` → 400, `MAX_MESSAGES+1` → 400 `{reply}`, too long `content` → 400 `{reply}`, invalid `lang` is not an error.

## 3. Call limit

- [x] 3.1 Create `src/rate-limit.js`: a wrapper over `checkRateLimit('chat', { request })` from `@vercel/firewall` that can be replaced; outside Vercel (locally) — no-op; verify `test/rate-limit.test.js` with a fake checker: `rateLimited: true` → limited, `false` → pass, a check failure does not break the request (logged, the request passes).

## 4. Search and Claude

- [x] 4.1 Create `src/retrieval.js`: `search(text)` via `index.searchRecords` (`topK=VECTOR_TOP_K`, namespace from env), filter `score >= VECTOR_MIN_SCORE`, grouping by `parent_id` with the maximum score and sorting (pure filter/grouping functions kept separate); verify `test/retrieval.test.js` without the network: three chunks of one `parent_id` → one group, hits below the threshold are dropped, order by score.
- [x] 4.2 Create `src/claude.js`: one `messages.create` with a constant `system`, `search_result` blocks and a `text` block with the question, `output_config.effort` only if set; before writing, check the `search_result` type in the installed `@anthropic-ai/sdk`; verify with a test using a fake client: request shape (blocks, order, model/token limit), no `effort` when env is empty, concatenation of the answer's `text` blocks.

## 5. Route and server

- [x] 5.1 Create `src/index.js` (Express app, `export default app`, no `listen`) and `src/local.js` (`express.static('public')` + `listen`): order limit → body parsing → validation → search → (no data → 200 `noData`) → Claude; Pinecone/Claude errors → 502 `{reply: failure}` with the cause logged; JSON parse error → 400 `{error}`; Express error handler; stage logging; verify with the integration `test/chat.test.js` (fake `rate-limit`/`retrieval`/`claude`) by scenarios from both specs: 200 with an answer, 200 "no data" without a Claude call, 400, 429 (including an invalid body over the limit → 429), 502.
- [x] 5.2 Manual check locally with real Pinecone/Claude (keys needed in `frontend/.env`): `npm run seed`, `npm run dev`, `curl` a question from the seed (answer matches the content), an off-topic question (fixed refusal), a long message (400); record the results in `README.md`.

## 6. Frontend

- [x] 6.1 Adapt `frontend/public/index.html` (the chat settings block and `getReply`/`send`): `CHAT_API_URL = '/chat'`; the request strictly `POST /chat` with the body `{"messages":[{"role":"user","content":"<user text>","lang":"<page language>"}]}` — always one element, no `history`; `lang` is taken from the page's existing `lang` variable; `reply` is read for non-2xx too, a generic error only when the body cannot be parsed; update the comment about the request format; verify in the browser (DevTools → Network): after switching the language to `uk` the body contains `"lang":"uk"` and one `messages` element, the answer is shown, a 400 shows the server text, the demo `KB` answers are unchanged; `grep` over `frontend/public/` finds no references to files outside the folder.

## 7. Deploy and documentation

- [x] 7.1 Set up Vercel: connect the GitHub repository, Root Directory `frontend`, Framework Preset "Other" without a build command, Ignored Build Step = "Only build if there are changes in a folder" with the value `frontend` (Settings → Build and Deployment), env from `.env.example` in the project settings, a Firewall rule (`@vercel/firewall` condition, Rate limit ID `chat`, fixed window 600 s, 20 requests, key IP); verify: a commit that changes only a file outside `frontend/` (for example in `openspec/`) does not trigger a new deploy (cancelled or skipped), and a commit in `frontend/` does; on a preview deploy `GET /` serves the page, the chat answers, the 21st call within 10 min → 429 with a localized `reply`, and `/src/index.js`, `/package.json`, `/.env` are not served.
- [x] 7.2 Add `frontend/README.md`: environment variables, `npm run seed`, `npm run dev`, `npm test`, the index requirement (`field_map` on `text`), the deploy steps from 7.1 (Root Directory `frontend`, Firewall rule), and that Docker and CI are not needed; update `CLAUDE.md` ("Current state" section: layout, build/test commands, running a single test `node --test test/<file>`); verify the README commands run as written.

## Workflow follow-up

- Sync the delta specs into the main specs (`/opsx:sync`) and archive the change after review.
