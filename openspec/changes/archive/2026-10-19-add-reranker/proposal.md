# Proposal

## Why

Pinecone dense search does not tell "no answer" from "a distant match": top-K always returns something. According to `scripts/measure-score.js` on the real index, the highest off-topic queries ("Opowiedz dowcip" 0.847, "Розкажи анекдот" 0.840) score above the lowest in-topic ones (minimum 0.812, p10 0.861), so a single `VECTOR_MIN_SCORE` threshold cannot separate them: the 0.847–0.851 gap rests on 27 queries. A reranker (cross-encoder) reads the query and the answer text together and judges whether the document answers the question, so its gap between relevant and irrelevant is sharper.

## What Changes

> Status after implementation: the reranker is implemented but **off by default** (`RERANK_MODEL` is empty). Calibration on the free Pinecone plan was not completed (the monthly limit of 500 rerank requests is exhausted, bge-reranker-v2-m3 gives ~0 for ~10% of in-topic queries; details in design.md). The main off-topic filtering in this change is provided by extra questions in the seed data and the refusal rule in Claude's system prompt.

- After dense search and grouping by `parent_id`, the groups that passed the coarse `VECTOR_MIN_SCORE` prefilter are reranked by a Pinecone model (`inference.rerank`) over the `answer` field. Groups with rerank score `>= RERANK_MIN_SCORE` are kept, and they are ordered by rerank score.
- If no group passed, the reply is "no information" without a Claude call (as now). If the dense prefilter kept nothing, rerank is not called.
- New environment variables: `RERANK_MODEL` (empty = reranker off, behavior as today) and `RERANK_MIN_SCORE`.
- A reranker failure gives 502 with a fixed text, with no silent fallback to dense-only, because that would let off-topic through.
- `VECTOR_MIN_SCORE` stays, but its role changes: when the reranker is on, it is a coarse prefilter and should be lowered (guideline 0.75) so the reranker sees borderline hits.
- Data and prompt: 47 questions (en/uk/pl) added to `data/faq.sample.json` for the nine records with the lowest dense score; Claude's system prompt refuses when the search results are only related to Vadym but do not answer the question (jokes, stories, general knowledge, passwords, data about other users or people).
- `scripts/measure-score.js` compares dense and rerank on the same queries (leave-one-out) and recommends `RERANK_MIN_SCORE`.
- Tests with fakes, `.env.example`, README.

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `chat-answering`: the "Retrieval with relevance threshold" requirement becomes two-step (coarse dense prefilter, then rerank threshold), a new requirement on reranking, an updated upstream failure requirement (rerank too), and an extended requirement on Claude's system instruction (refuse when the results do not answer the question).

## Impact

- `frontend/src/retrieval.js`, `frontend/src/config.js`, `frontend/src/claude.js`, `frontend/test/claude.test.js`, `data/faq.sample.json`, `frontend/test/retrieval.test.js`, `frontend/test/config.test.js`, `frontend/scripts/measure-score.js`, `frontend/.env.example`, `frontend/README.md`, the root `README.md` (pipeline description).
- Dependencies do not change: `inference.rerank` is in `@pinecone-database/pinecone` ^9.
- When the reranker is on: an extra network call per request (only when the prefilter kept something) and Pinecone rerank billing. On the free plan the limit is 60 requests per minute and 500 per month per organization, which is too little for production.
- The `POST /chat` contract does not change.
