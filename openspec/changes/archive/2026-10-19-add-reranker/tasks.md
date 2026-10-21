# Tasks

## 1. Config

- [x] 1.1 In `frontend/src/config.js` add `rerankModel` (`RERANK_MODEL`, empty = off) and `rerankMinScore` (`RERANK_MIN_SCORE`, numeric default via `num`), following `vectorMinScore`. Check: `node --test test/config.test.js` with new cases (defaults, values from env, empty string).
- [x] 1.2 Add both variables to `frontend/.env.example` with a comment that `VECTOR_MIN_SCORE` is a coarse prefilter when the reranker is on. Check: the file contains both keys and the explanation.

## 2. Retrieval

- [x] 2.1 In `createRetrieval` (`frontend/src/retrieval.js`) accept `rerank` (a function, by default via `pc.inference.rerank`) the same way as `index`, so tests work without the network. Do not touch `filterHits` and `groupByParent`.
- [x] 2.2 After `groupByParent(filterHits(...))`, and only when `config.rerankModel` is non-empty and there is more than zero groups: call rerank with `query=text`, `documents` = the groups' unique `answer`s, `rankFields: ['answer']`, `topN` = number of groups; replace the group scores with the rerank score, filter `>= rerankMinScore`, sort by it. With no groups rerank is not called. Return the same `{hits, groups}` shape.
- [x] 2.3 Do not catch the rerank error in `retrieval.js`, so it rises to the existing 502 handling. Check: a test in `retrieval.test.js` that a rejected rerank gives a rejected `search`.
- [x] 2.4 Tests in `frontend/test/retrieval.test.js` (fake rerank): off = rerank not called; a group with a high dense but low rerank score is dropped; order by rerank score; three chunks of one `parent_id` give one document in rerank; empty groups do not call rerank. Check: `node --test test/retrieval.test.js`.
- [x] 2.5 In `frontend/test/chat.test.js` add cases: all groups dropped by rerank gives 200 with the "no information" text and no Claude call; a rejected rerank gives 502. Check: `node --test test/chat.test.js`, then `npm test` passes completely.

## 3. Calibration

- [x] 3.1 Before choosing a model, check the current Pinecone documentation (the `context7-mcp` skill) for the list of rerank models, their uk/pl support and the document length limit, and record the choice in `design.md` (Open Questions). Check: a line in `design.md` with the model and rationale.
- [x] 3.2 Expand the off-topic sample in `frontend/scripts/measure-score.js` (target: at least 60 queries, en/uk/pl, with jokes, greetings, questions about users, questions about other people). Check: the script prints `n=` of at least 60 for off-topic.
- [x] 3.3 In `measure-score.js` add a rerank mode: when `RERANK_MODEL` is set, for each query (dropping its own chunk, as now) group the dense hits, rerank, and print the rerank score distribution for in-topic and off-topic, the lowest in-topic, the highest off-topic, a threshold table and a recommended `RERANK_MIN_SCORE` range. Do not change the dense output. Check: `npm run measure-score` with and without `RERANK_MODEL`.
- [x] 3.4 Add paraphrases (en/uk/pl) to the nine records with the lowest dense score in `data/faq.sample.json`, seed (`npm run seed`) and re-measure dense (`npm run measure-score` without `RERANK_MODEL`). The result is recorded in `design.md`. Calibrating `RERANK_MIN_SCORE` is moved out of this change (see Status in `design.md`).

## 4. System prompt and documentation

- [x] 4.1 In `SYSTEM_PROMPT` (`frontend/src/claude.js`) add a rule: answer only when a result directly answers the question, otherwise say there is no information; a test in `frontend/test/claude.test.js`. Check: `npm test` passes, a manual check on a joke/passwords.
- [x] 4.2 Update `frontend/README.md` (env, the role of `VECTOR_MIN_SCORE`, calibration via `npm run measure-score`, rollback by clearing `RERANK_MODEL`) and the pipeline description in the root `README.md` and `CLAUDE.md`. Check: the described commands run as written.
