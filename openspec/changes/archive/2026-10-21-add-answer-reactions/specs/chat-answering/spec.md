# Spec Delta

## MODIFIED Requirements

### Requirement: No data answer
The system SHALL respond 200 with a fixed "no information" text in the message language when no hits remain after filtering, and SHALL NOT call Claude. Before responding, it SHALL record the question in `reactions` with `answer` set to that text and `reaction` null; a failed record SHALL be logged and SHALL NOT change the response.

#### Scenario: Off-topic question
- **WHEN** the question has no hit with score >= `VECTOR_MIN_SCORE` and `lang` is `pl`
- **THEN** the system responds 200 with `{"reply": "Przepraszam, nie mogę pomóc w tej sprawie. Nie mam informacji na ten temat."}`

#### Scenario: No data is recorded
- **WHEN** a valid question ends in the "no information" answer
- **THEN** one row with that question, the fixed text as `answer` and null `reaction` is stored before the response is sent

#### Scenario: Recording fails on no data
- **WHEN** the database write raises an error or no database is configured
- **THEN** the system still responds 200 with the "no information" text and logs the error

### Requirement: Upstream failure
The system SHALL respond 502 with `{"reply": "<fixed text>"}` in the message language when Pinecone (search or rerank) or Claude fails, and SHALL log the cause. For a valid question that fails this way, or fails with an unexpected error (500), it SHALL record the question in `reactions` with null `answer` and null `reaction` before responding; a failed record SHALL be logged and SHALL NOT change the response.

#### Scenario: Pinecone unavailable
- **WHEN** the Pinecone search raises an error
- **THEN** the system responds 502 with a fixed "something went wrong" text and does not call Claude

#### Scenario: Reranker unavailable
- **WHEN** reranking is enabled and the rerank call raises an error
- **THEN** the system responds 502 with a fixed "something went wrong" text, does not fall back to the dense scores and does not call Claude

#### Scenario: Failure is recorded
- **WHEN** Claude fails for a valid question
- **THEN** one row with that question, null `answer` and null `reaction` is stored before the 502 is sent

#### Scenario: Recording fails on upstream failure
- **WHEN** the upstream call and the database write both fail
- **THEN** the system still responds 502 with the fixed text and logs both errors

#### Scenario: Requests rejected before processing are not recorded
- **WHEN** the request is rejected with 400 or 429
- **THEN** no row is stored
