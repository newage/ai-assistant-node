# Spec Delta

## MODIFIED Requirements

### Requirement: Retrieval with relevance threshold
The system SHALL search the knowledge base with the last message text, requesting `VECTOR_TOP_K` hits, and SHALL keep only hits with score greater than or equal to `VECTOR_MIN_SCORE`. When reranking is enabled, this threshold acts as a coarse prefilter and the kept hits are then reranked as described in "Reranking of retrieved groups".

#### Scenario: Hits below threshold
- **WHEN** all hits have score below `VECTOR_MIN_SCORE`
- **THEN** the system treats the result as "no data", does not call the reranker and does not call Claude

### Requirement: Upstream failure
The system SHALL respond 502 with `{"reply": "<fixed text>"}` in the message language when Pinecone (search or rerank) or Claude fails, and SHALL log the cause.

#### Scenario: Pinecone unavailable
- **WHEN** the Pinecone search raises an error
- **THEN** the system responds 502 with a fixed "something went wrong" text and does not call Claude

#### Scenario: Reranker unavailable
- **WHEN** reranking is enabled and the rerank call raises an error
- **THEN** the system responds 502 with a fixed "something went wrong" text, does not fall back to the dense scores and does not call Claude

### Requirement: Answer generated only from retrieved context
When groups remain, the system SHALL call Claude exactly once, passing a constant system instruction (answer in the language of the user's message, use only the retrieved context, speak as Vadym's assistant about him in third person, answer only when a retrieved result directly answers the question and otherwise say the information is not available), the retrieved answers as search-result content and the user's question, and SHALL return the model's text as `reply`.

#### Scenario: One model call per request
- **WHEN** at least one group remains
- **THEN** exactly one request is made to Claude using `CLAUDE_MODEL`, `CLAUDE_MAX_TOKENS` and, if set, `CLAUDE_EFFORT`

#### Scenario: Related but non-answering context
- **WHEN** retrieved groups are only related to Vadym and the question asks for a joke, a story, general knowledge, credentials or data about other users or people
- **THEN** the instruction tells Claude to state that it does not have this information instead of answering

## ADDED Requirements

### Requirement: Reranking of retrieved groups
When `RERANK_MODEL` is set, the system SHALL rerank the groups that passed the retrieval threshold against the last message text using the `answer` of each group, SHALL keep only groups with rerank score greater than or equal to `RERANK_MIN_SCORE`, and SHALL order the kept groups by rerank score. When `RERANK_MODEL` is empty, the system SHALL NOT rerank and SHALL behave as before.

#### Scenario: Off-topic question with a high dense score
- **WHEN** a hit passes `VECTOR_MIN_SCORE` but every group has rerank score below `RERANK_MIN_SCORE`
- **THEN** the system responds 200 with the fixed "no information" text and does not call Claude

#### Scenario: Relevant group survives
- **WHEN** at least one group has rerank score greater than or equal to `RERANK_MIN_SCORE`
- **THEN** only the groups at or above the threshold are passed to Claude, ordered by rerank score

#### Scenario: Reranking disabled
- **WHEN** `RERANK_MODEL` is empty
- **THEN** no rerank call is made and the groups passed to Claude are those that passed `VECTOR_MIN_SCORE`, ordered by dense score

#### Scenario: Each answer is reranked once
- **WHEN** three kept hits share one `parent_id`
- **THEN** the reranker receives that `answer` once
