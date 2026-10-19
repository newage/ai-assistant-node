# Decision log: Node chat service with RAG (Pinecone + Claude)

## Problem
The personal site (`frontend/index.html`) has an "Ask my AI assistant" call to action, but there is no backend. A visitor cannot ask about Vadym's experience, and the answer must rely only on facts from the knowledge base, with no model inventions. Without changes the assistant stays decorative.

## Given
- The repository has no code, only `frontend/index.html` — verified: `ls frontend`
- `openspec/config.yaml` exists, there are no active changes; we do not create an OpenSpec change (no-OpenSpec mode)
- A single `POST /chat`, body `{messages:[{role,content,lang}]}`, `lang` ∈ uk/en/pl, response `{reply}` — `.agents/propose/setup.md`
- LLM key — `ANTHROPIC_API_KEY` (confirmed by the user; `OPENAI_API_KEY` in setup.md is a typo)
- Embeddings are built into Pinecone (text query, no external embedding model)
- Hosting — Vercel: only the `frontend/` folder is deployed (Root Directory), static files in `frontend/public/`, the Node function `/chat` on the same domain → no CORS needed; no Docker and no CI needed
- No dialog history: only one (the last) message is processed
- Log: structured `console.log` of every stage when `ENVIRONMENT != production`
- Env in `.env.example`: `CLAUDE_MODEL`, `CLAUDE_EFFORT`, `CLAUDE_MAX_TOKENS`, `MAX_MESSAGES`, `MAX_MESSAGE_CHARS`, `VECTOR_MIN_SCORE`, `PINECONE_API_KEY`, `PINECONE_INDEX_NAME`, `ENVIRONMENT`

## Solution concept
**Chosen:** a direct pipeline: Pinecone always first, filter by score, Claude receives only fragments above the threshold.
**Whose:** proposed by the developer (setup.md)
**Why:** deterministic refusal with fixed texts, one LLM call, predictable cost.
**Rejected:**
- Tool use (Claude decides whether to search) — 2 calls, refusal texts are not fixed, harder to guarantee "only from the base".

## Direction
```
Browser ──POST /chat──▶ Vercel (one domain; GET / → frontend/public/index.html, POST /chat → Node function)
  1 rate limit per IP (429)  →  2 validation (400)  →  3 take the last message
  4 Pinecone search (integrated embedding, VECTOR_TOP_K)
  5 hits with score >= VECTOR_MIN_SCORE, grouped by parent_id (same answer) ?
      none → 200 {reply: fixed text by lang}
      some → 6 Claude (system + search_result blocks with `answer` + question) → 200 {reply}
  Pinecone/Claude failure at 4 or 6 → 502 {reply: fixed text by lang}
  every stage → console.log (structured) if ENVIRONMENT != production
Index seeding — `scripts/seed-pinecone.js` (separate from the service).
```
- The request body may contain several messages, but only the last one is processed; the rest are only validated against `MAX_MESSAGES` and `MAX_MESSAGE_CHARS`.
- Deliberately not doing: dialog history, streaming, CORS, authentication.

## Details
### Pinecone record schema and `top_k`
**Decision:** `top_k` is a query parameter, not a record field; moved to the env `VECTOR_TOP_K`. Data source — `data/faq.sample.json` (42 FAQ items: `parent_id,type,project,lang,text,questions`, see "Index seed").
**Why:** `top_k` is not a property of the data and should not be in the sample.

### Pinecone/Claude failure
**Decision:** HTTP 502 and the same `{reply}` with a fixed text in the `lang` language; the cause is written to the log.
**Why:** the user sees a familiar text, while failures are visible in statuses.
**Alternative:** 200 + fixed text — a failure cannot be told apart from "no information".

### Abuse protection
**Decision:** 20 calls per 10 minutes per IP: a Vercel Firewall rule (Rate limit ID `chat`) + `checkRateLimit` from `@vercel/firewall` in code, over the limit — our own 429 `{reply}`. An in-memory limit does not fit: Vercel functions do not guarantee a single instance.
**Why:** a public endpoint, every request may cost a Claude call.
**Limitation:** on Hobby the window is at most 10 min, counters are per region (the limit is approximate). **Alternatives:** no limit — risk of a bill; Upstash Redis — exact 20/hour, but an extra service.

### Length validation
**Decision:** `messages` longer than `MAX_MESSAGES` or `content` longer than `MAX_MESSAGE_CHARS` → HTTP 400 and `{reply}` (as with other refusals — the frontend shows `reply`) in the `lang` language:
- uk: «Повідомлення занадто довге. Будь ласка, переформулюйте запитання коротше.»
- en: «Your message is too long. Please rephrase your question to make it shorter.»
- pl: «Wiadomość jest zbyt długa. Przeformułuj pytanie, aby było krótsze.»
**Why:** the user sees what to do; no Pinecone or Claude call is made.

### Limit and invalid `lang`
**Decision:** 429 returns `{reply}` in the `lang` language:
- uk: «Забагато запитів. Будь ласка, спробуйте пізніше.»
- en: «Too many requests. Please try again later.»
- pl: «Zbyt wiele zapytań. Spróbuj ponownie później.»

If `lang` is missing or outside uk/en/pl — all fixed texts (400, 429, 502, refusal) are returned in English. The limit is checked before validation, so for 429 `lang` is taken from the body if it is readable, otherwise `en`.

### Index seed
**Decision:** each FAQ item gets 1 + N chunks (example — `.agents/propose/example-chank.md`): `_id` = `<parent_id>-NN` (01 — the original text, 02.. — questions). The `text` field is embedded (chunk 01 — the original, the rest — questions), all chunks have `answer` = the original text, plus `parent_id`, `type`, `lang`, `project` (null is not written). The index is created separately with `field_map` on `text` (`PINECONE_TEXT_FIELD`); namespace — `PINECONE_NAMESPACE`. Run: `npm run seed` (`-- --dry-run` only counts).
**Why:** user questions are closer to the FAQ questions than to the answer text; chunk 01 catches queries similar to the text itself.
**Consequence for /chat:** the `answer` field goes to Claude; several chunks of one `parent_id` may land in top_k — after the score filter we group by `parent_id` (all have the same `answer`), one entry per group goes to Claude; groups are ordered by the highest score in the group. If the groups are empty after the filter — a fixed refusal. Records removed from the JSON do not disappear from the index on their own.

### Claude request
**Decision:** `system` is a constant: "Answer in the language of the user's message. Use only the retrieved context. You are Vadym's assistant, answer about him in third person." The single user message contains `search_result` blocks (one per `parent_id` group: `source`/`title` = `parent_id`, `content` = the `answer` field), and last a `text` with the user's question. `citations` are not enabled.
**Why:** instructions, RAG data and the question live in separate places; the answer language is determined by the message, and `lang` is needed only for the fixed refusal and error texts.
**Consequence:** `CLAUDE_EFFORT` is passed as `output_config.effort`; an empty value — the parameter is not passed.

## Open questions
- ~~Data format in the index and seed~~ — resolved, see "Index seed" above.
- `VECTOR_TOP_K=10` is a starting value (chunks of one `parent_id` occupy places in top_k); tune on real data.

## Assumptions
- CORS is not configured (single origin).
- Validation: empty `content` → 400 with `{error}`; `lang` outside uk/en/pl is not an error — we answer in English (non-blocking). Too long `content` or `messages` longer than `MAX_MESSAGES` → 400 with `{reply}` as a fixed text by `lang` (see "Length validation").
- The last message has `role: user`; otherwise 400 (non-blocking).
- New env in `.env.example`: `VECTOR_TOP_K`; `OPENAI_API_KEY` from setup.md is a typo, `ANTHROPIC_API_KEY` is used.
