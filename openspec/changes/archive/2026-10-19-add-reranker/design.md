# Design

## Context

`createRetrieval` (`frontend/src/retrieval.js`) makes one `searchRecords` (`topK=VECTOR_TOP_K`, `fields: parent_id, answer`), drops hits below `VECTOR_MIN_SCORE` and groups by `parent_id`, where the group score is the maximum chunk score. For the motivation and numbers see proposal.md.

Checked in the SDK (`@pinecone-database/pinecone` ^9): `searchRecords` accepts `rerank: {model, rankFields, topN}`, but then returns only the rerank score and the dense score is lost. Separately there is `pc.inference.rerank({model, query, documents, rankFields, topN, returnDocuments})`.

## Goals / Non-Goals

**Goals:**
- Cut off off-topic queries that the dense score cannot tell apart.
- Keep `VECTOR_MIN_SCORE` as a cheap prefilter, and without `RERANK_MODEL` behavior does not change.
- Allow `RERANK_MIN_SCORE` to be calibrated with the same script as the dense threshold.

**Non-Goals:**
- Hybrid/sparse search, a classifier before search.
- Changing the `/chat` contract, the index record schema, `seed-pinecone.js`.
- Caching rerank results.

## Decisions

**1. Two steps: dense `searchRecords`, then `inference.rerank`, instead of `rerank` inside `searchRecords`.**
Reason: the built-in rerank replaces the score, so a prefilter by `VECTOR_MIN_SCORE` is impossible, and rerank is paid for every request, even "hello". In the two-step variant, queries whose hits are all below the prefilter never reach rerank. Downside: a second network call. The alternative (one call, rerank threshold only) is simpler and faster but worse on cost; it can be revisited if latency becomes a problem.

**2. Rerank after grouping, the unit is the group (unique `answer`).**
All chunks of one `parent_id` have the same `answer`, so up to `VECTOR_TOP_K` unique documents go to the reranker, without duplicates. The group score is the rerank score of its `answer`. This keeps the existing contract "Claude receives each `answer` once".

**3. Rank by the `answer` field, not `text`.**
`text` is the chunk's short question, while `answer` determines the answer to the question. The model's document length limit needs to be checked (see Open Questions).

**4. An empty `RERANK_MODEL` means off.**
Gives backward compatibility, a safe rollback by changing env, and does not break existing tests and deploys. `RERANK_MIN_SCORE` is read as a number with a default that is set after calibration (task 4.2).

**5. A reranker failure means 502, with no fallback to dense.**
A fallback would let through exactly the off-topic this change targets. 502 is already the behavior for a Pinecone failure, so the new branch introduces no new status.

**6. The measurement script switches to rerank with the same env.**
`measure-score.js` prints dense and rerank scores for each query group and a threshold table for rerank, so calibration happens in the same place as now. The dense part of the script stays unchanged.

**7. A refusal rule in Claude's system prompt (added during implementation).**
Reason: the reranker could not be calibrated (see below), and dense search lets through ~8% of off-topic queries (jokes, passwords) because their score is above the lowest in-topic ones. The instruction "answer only when a result directly answers the question" closes them at the last step with no new calls. Checked manually in Polish, Ukrainian and English and with the admin password; the full off-topic sample was not run through Claude (paid calls). Downside: it is model behavior, not a deterministic threshold; the Ukrainian answer to "Розкажи смішну історію" refused but added a retelling of another fact about Vadym.

**8. The reranker stays in the code but is off.**
The implementation (tasks 1–2) is complete and covered by tests, so enabling it only needs `RERANK_MODEL` and `RERANK_MIN_SCORE`. Calibration (task 3.4) and a check in operation (4.1) are moved out of this change, because they need a paid Pinecone plan or another model (see Open Questions).

## Risks / Trade-offs

- [The rerank score is not normalized like cosine and depends on the model] → the threshold is calibrated separately with the script, the default is not carried over from `VECTOR_MIN_SCORE`; changing the model requires recalibration.
- [Latency and cost of the extra call] → rerank only when the prefilter kept something; top-N is limited by `VECTOR_TOP_K`; measure latency in task 4.
- [A low `VECTOR_MIN_SCORE` increases the share of queries that reach rerank] → the 0.75 guideline is confirmed by the script, not guessed.
- [A small off-topic sample (27) gives false confidence] → expand the sample before fixing the threshold (task 3.2).
- [Multilingual: not every rerank model works well with uk/pl] → choose the model by the script's results on uk/pl queries, not by its description.

## Migration Plan

1. Deploy the code with `RERANK_MODEL` empty, which changes nothing.
2. Calibrate on the real index with the script, set `RERANK_MODEL`, `RERANK_MIN_SCORE`, lower `VECTOR_MIN_SCORE`.
3. Rollback: clear `RERANK_MODEL` and return `VECTOR_MIN_SCORE=0.84`.

## Open Questions

- Which exact model and what limit on `answer` length (longer answers may be truncated): decided in task 3.1 from the Pinecone documentation and the script's results, does not affect the spec.

**Model choice (task 3.1, `pc.inference.listModels({type:'rerank'})`, 2026-10-19):** available are `bge-reranker-v2-m3` (multilingual, up to 1024 tokens, `truncate` defaults to `NONE`), `cohere-rerank-4-fast` (4096 tokens), `cohere-rerank-3.5` (deprecated), `pinecone-rerank-v0` (512 tokens, English-oriented, so not suitable for uk/pl). The longest `answer` in `data/faq.sample.json` is about 930 characters (below both limits). Initial choice: `bge-reranker-v2-m3` as multilingual and the simplest; if task 3.4 shows overlapping groups, compare with `cohere-rerank-4-fast` using the same script. Long `answer`s with `truncate=NONE` will give an error, i.e. 502; not relevant now, but to keep in mind as answers grow.

**Calibration result (task 3.4, `bge-reranker-v2-m3`, prefilter `VECTOR_MIN_SCORE=0.75`, 2026-10-19):** off-topic n=64: max 0.112 ("hello"), then ≤0.004, median 0.000. In-topic n=268 (leave-one-out): p10 0.132, median 0.955, p5 0.019, minimum 0.000; for 74 of 268 the best group belongs to a different FAQ record. Examples of in-topic with a rerank score near 0: "Хто такий Вадим Леонт'єв?", "Який бекенд-стек знає Вадим?", "Яку роль шукає Вадим?". A threshold of 0.50 gives in-topic 84% and off-topic 0%; a threshold of 0.15 gives 90% and 0%. The 3.4 criterion (off-topic max < in-topic p5 with margin) is not met: the groups overlap because of ~10% of in-topic queries, not off-topic. `cohere-rerank-4-fast` is not available to this Pinecone project ("Project is not authorized to use model"). The threshold was not set in `.env`. Also: a limit of 60 rerank requests per minute per project (429), which applies to production too.

**Status (2026-10-19):** tasks 3.4 and 4.1 were removed from this change: on the free Pinecone plan the monthly rerank limit is exhausted (500 requests per organization, `429`), and `cohere-rerank-4-fast` is not available without a paid plan. To return to the reranker: (a) move to a paid plan or find another model; (b) work out why `bge-reranker-v2-m3` gives ~0 for some Ukrainian in-topic queries (check `truncate: END`, the `answer` language, add the chunk question to the rerank document); (c) repeat `npm run measure-score` with `RERANK_MODEL` (the script keeps the 60/min limit and retries on 429; one run is ~330 calls, so the 500/month limit is used up by one or two runs); (d) do it as a separate change.

**Result of the extra seed questions:** after adding 47 questions, dense measurement (n=315 in-topic, n=64 off-topic): in-topic minimum 0.812 → 0.842, p10 0.861 → 0.863; off-topic maximum unchanged, 0.855 ("Opowiedz zabawną historię"). `VECTOR_MIN_SCORE` stays 0.84 (100% of in-topic passes, 8% of off-topic too, closed by the refusal rule in the prompt). A threshold of 0.86 cuts off 7% of in-topic, and the 0.855–0.857 gap is too narrow and optimistic, because the in-topic sample includes the new questions written with the weak spots in mind.
