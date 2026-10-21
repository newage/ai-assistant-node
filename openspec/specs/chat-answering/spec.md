# chat-answering Specification

## Purpose

Answering a visitor's question about Vadym using only the knowledge base: `POST /chat` retrieves relevant fragments and returns an answer, or a fixed text in the user's language when there is no data or an upstream failure.

## Requirements

### Requirement: Chat request contract
The system SHALL expose `POST /chat` accepting `{"messages":[{"role","content","lang"}]}` and SHALL answer with JSON `{"reply": "<text>"}`. `lang` SHALL be one of `uk`, `en`, `pl`. Only the last element of `messages` SHALL be processed; earlier elements are only validated.

#### Scenario: Successful answer
- **WHEN** a valid request is received and the knowledge base has a relevant fragment
- **THEN** the system responds 200 with `{"reply": "<answer>"}`

#### Scenario: Only the last message is processed
- **WHEN** `messages` contains several valid elements
- **THEN** only the `content` of the last element is used to search and answer

### Requirement: Request validation
The system SHALL respond 400 with `{"error": "<description>"}` when `messages` is missing or empty, the last message has an empty `content` or a `role` other than `user`.

#### Scenario: Empty content
- **WHEN** the last message has an empty or whitespace-only `content`
- **THEN** the system responds 400 with `{"error": ...}` and calls neither Pinecone nor Claude

#### Scenario: Last message is not from the user
- **WHEN** the last message has `role` other than `user`
- **THEN** the system responds 400 with `{"error": ...}`

### Requirement: Message length limits
The system SHALL respond 400 with `{"reply": "<fixed text>"}` in the message language when `messages` has more than `MAX_MESSAGES` elements or any `content` is longer than `MAX_MESSAGE_CHARS`, without calling Pinecone or Claude. The text SHALL ask the user to rephrase the question shorter.

#### Scenario: Too many messages
- **WHEN** `messages` has `MAX_MESSAGES + 1` elements and `lang` is `uk`
- **THEN** the system responds 400 with the Ukrainian "message too long" text in `reply`

#### Scenario: Too long content
- **WHEN** a `content` is longer than `MAX_MESSAGE_CHARS`
- **THEN** the system responds 400 with the "message too long" text in the message language

### Requirement: Fixed texts language fallback
The system SHALL produce every fixed text (too long, no data, rate limit, upstream failure) in the language given by `lang`. If `lang` is missing or not one of `uk`, `en`, `pl`, the system SHALL use English and SHALL NOT treat it as a validation error.

#### Scenario: Unknown language
- **WHEN** `lang` is `de` and the knowledge base has no relevant data
- **THEN** the system responds 200 with the English "no information" text

### Requirement: Retrieval with relevance threshold
The system SHALL search the knowledge base with the last message text, requesting `VECTOR_TOP_K` hits, and SHALL keep only hits with score greater than or equal to `VECTOR_MIN_SCORE`. When reranking is enabled, this threshold acts as a coarse prefilter and the kept hits are then reranked as described in "Reranking of retrieved groups".

#### Scenario: Hits below threshold
- **WHEN** all hits have score below `VECTOR_MIN_SCORE`
- **THEN** the system treats the result as "no data", does not call the reranker and does not call Claude

### Requirement: Grouping of hits by parent
The system SHALL group the kept hits by `parent_id` and SHALL pass each group to Claude once, using the `answer` field. Groups SHALL be ordered by the highest score within the group.

#### Scenario: Several chunks of one FAQ item
- **WHEN** three kept hits share one `parent_id`
- **THEN** Claude receives that `answer` once

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

### Requirement: No data answer
The system SHALL respond 200 with a fixed "no information" text in the message language when no hits remain after filtering, and SHALL NOT call Claude.

#### Scenario: Off-topic question
- **WHEN** the question has no hit with score >= `VECTOR_MIN_SCORE` and `lang` is `pl`
- **THEN** the system responds 200 with `{"reply": "Przepraszam, nie mogę pomóc w tej sprawie. Nie mam informacji na ten temat."}`

### Requirement: Answer generated only from retrieved context
When groups remain, the system SHALL call Claude exactly once, passing a constant system instruction (answer in the language of the user's message, use only the retrieved context, speak as Vadym's assistant about him in third person, answer only when a retrieved result directly answers the question and otherwise say the information is not available), the retrieved answers as search-result content and the user's question, and SHALL return the model's text as `reply`.

#### Scenario: One model call per request
- **WHEN** at least one group remains
- **THEN** exactly one request is made to Claude using `CLAUDE_MODEL`, `CLAUDE_MAX_TOKENS` and, if set, `CLAUDE_EFFORT`

#### Scenario: Related but non-answering context
- **WHEN** retrieved groups are only related to Vadym and the question asks for a joke, a story, general knowledge, credentials or data about other users or people
- **THEN** the instruction tells Claude to state that it does not have this information instead of answering

### Requirement: Upstream failure
The system SHALL respond 502 with `{"reply": "<fixed text>"}` in the message language when Pinecone (search or rerank) or Claude fails, and SHALL log the cause.

#### Scenario: Pinecone unavailable
- **WHEN** the Pinecone search raises an error
- **THEN** the system responds 502 with a fixed "something went wrong" text and does not call Claude

#### Scenario: Reranker unavailable
- **WHEN** reranking is enabled and the rerank call raises an error
- **THEN** the system responds 502 with a fixed "something went wrong" text, does not fall back to the dense scores and does not call Claude

### Requirement: Single deployable folder, same origin
Everything needed to run the site SHALL live in the `frontend/` folder: the static site in `frontend/public/` (served at the site root, so `GET /` returns `index.html`), the Node code and its dependencies. Deploying only `frontend/` SHALL give a working site with `POST /chat` on the same origin as the page.

#### Scenario: Root request
- **WHEN** a browser requests `GET /` on the deployed site
- **THEN** the system returns `index.html` from `frontend/public/`

#### Scenario: Only frontend is deployed
- **WHEN** only the contents of `frontend/` are deployed
- **THEN** the page loads, `/chat` answers on the same origin, and no file outside `frontend/` is required at runtime

#### Scenario: Server code is not public
- **WHEN** a browser requests a path of server code or configuration (for example `/src/index.js`, `/package.json`, `/.env`)
- **THEN** the system does not return its content

### Requirement: Stage logging outside production
When `ENVIRONMENT` is not `production`, the system SHALL write a structured `console.log` entry for each processing stage of a request (received, validated, search result, filtered groups, Claude call, response). In production these entries SHALL NOT be written.

#### Scenario: Local run
- **WHEN** `ENVIRONMENT=local` and a request is processed
- **THEN** each stage appears in the console as a structured entry
