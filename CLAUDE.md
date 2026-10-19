# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Current state

Node.js (ESM) AI assistant for a personal site. Everything deployable lives in `frontend/` (Vercel Root Directory); see `frontend/README.md` for env vars, deploy steps and the `/chat` contract.

```
frontend/public/    static site (index.html)
frontend/src/       Express app: index.js (default export, Vercel entry), local.js (static + listen),
                    config, log, messages, validate, rate-limit, retrieval (Pinecone), claude
frontend/scripts/   seed-pinecone.js
frontend/test/      node:test, no network (fakes for rate-limit/retrieval/claude)
data/               faq.sample.json (seed data, outside the deploy)
docker/             docker-compose.yml for local dev
```

`POST /chat` pipeline: rate limit → body parse → validate → Pinecone search (score ≥ `VECTOR_MIN_SCORE`, grouped by `parent_id`) → optional Pinecone rerank (`RERANK_MODEL`, empty = off; groups ≥ `RERANK_MIN_SCORE`) → one Claude call with only the retrieved context. Fixed uk/en/pl texts for no-data/too-long/rate-limit/failure live in `src/messages.js`.

Commands (run in `frontend/`, needs `.env` from `.env.example`):

- `npm ci` — install
- `npm run dev` — local server on :3000 (or `docker compose -f docker/docker-compose.yml up` from the repo root)
- `npm test` — all tests; single file: `node --test test/<file>`
- `npm run seed [-- --dry-run]` — fill Pinecone from `data/faq.sample.json`

There is no lint or build step. Server code must never go under `public/` (Vercel serves it as static).

## Spec-driven workflow (OpenSpec)

Changes are meant to be planned through [OpenSpec](https://openspec.dev) using the `spec-driven` schema (`openspec/config.yaml`):

- `openspec/specs/` holds the main specs (currently empty).
- `openspec/changes/` holds in-flight changes; completed ones go to `openspec/changes/archive/`.
- Workflow is driven by slash commands in `.claude/commands/opsx/` (`/opsx:explore`, `/opsx:propose`, `/opsx:apply`, `/opsx:sync`, `/opsx:archive`) and matching skills in `.claude/skills/openspec-*`. Typical flow: explore, propose (generates proposal, design, specs and tasks in one step), apply (implement tasks), sync delta specs to main specs, archive.
- `openspec/config.yaml` has its optional `context`, `rules`, and `operations` sections commented out. Add project constraints there as they arise.

## Agent skills

`.agents/skills/` contains vendored skills (`context7-mcp`, `find-skills`, `skill-creator`). They are tooling for agents, not part of the product.
