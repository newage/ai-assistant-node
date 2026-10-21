# Proposal

## Why

The personal site (`frontend/index.html`) has an "Ask my AI assistant" chat, but it only works in demo mode (`CHAT_API_URL = null`, canned answers). A visitor cannot ask a real question about Vadym's experience, and the answer must rely only on facts from the knowledge base, with no invention by the model.

## What Changes

- A new Node service: a single `POST /chat` (`{messages:[{role,content,lang}]}` → `{reply}`) that searches Pinecone (integrated embedding), drops hits below `VECTOR_MIN_SCORE`, groups chunks by `parent_id`, and builds the answer with one Claude call using only the retrieved context.
- Deterministic fixed texts (uk/en/pl; invalid `lang` → en) for: no data (200), message too long (400), limit exceeded (429), Pinecone/Claude failure (502).
- Rate limit: 20 calls per 10 minutes per IP (Vercel Firewall rule + a check in code via `@vercel/firewall`).
- Everything deployable lives in one `frontend/` folder (static files in `frontend/public/`, Node code and dependencies alongside) and is deployed to Vercel (Root Directory = `frontend`, deploy from GitHub without Docker or CI). Static files and `/chat` share one origin, so CORS is not needed.
- A structured `console.log` for each stage when `ENVIRONMENT != production`.
- Adapt `frontend/index.html` to the contract: request body format, `lang`, showing `reply` for non-2xx responses too, `CHAT_API_URL = '/chat'`.
- The seed script `scripts/seed-pinecone.js` already exists (separate earlier work) and is not changed.

## Capabilities

### New Capabilities
- `chat-answering`: the `POST /chat` contract — validation, picking the last message, Pinecone search with a threshold and grouping, a Claude answer based only on the retrieved context, fixed refusals and errors by language.
- `chat-abuse-protection`: per-IP call limit (20 per 10 min) and the 429 response.

### Modified Capabilities
<!-- none: openspec/specs is empty -->

## Impact

- New service code (Node, ESM) in `frontend/`; `package.json`, `scripts/seed-pinecone.js` and `index.html` move into `frontend/` (`index.html` → `frontend/public/`); dependencies: `@pinecone-database/pinecone`, `@anthropic-ai/sdk`, `express`, `@vercel/firewall`.
- `frontend/public/index.html` — the chat settings block and `getReply`/`send`.
- `.env.example` moves into `frontend/`; in production, variables are set in the Vercel project settings.
- External systems: Vercel (hosting, Firewall), Pinecone (index with `field_map` on `text`, filled by `npm run seed`), Anthropic API (costs — limited by the rate limit).
- Out of scope: dialog history, streaming, CORS, authentication, changes to data/seeding.
