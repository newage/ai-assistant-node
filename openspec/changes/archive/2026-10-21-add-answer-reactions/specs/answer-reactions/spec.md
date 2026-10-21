# Spec Delta

## Purpose

Lets a visitor rate a bot answer with 👍/👎 and stores the rating together with the question and the answer, so the site owner can see which answers help and which questions the bot could not answer.

## ADDED Requirements

### Requirement: Reaction request contract
The system SHALL expose `POST /answer` accepting JSON `{"question": "<text>", "answer": "<text>", "reaction": "good|bad"}`. It SHALL store one record with these three values and the creation time, and respond 201.

#### Scenario: Valid reaction
- **WHEN** a valid body with `reaction` `good` is received
- **THEN** one row with the given `question`, `answer`, `reaction` and an automatic creation time is stored and the system responds 201

#### Scenario: Every valid request stores a row
- **WHEN** the same valid body is received twice
- **THEN** two rows are stored; the system does not deduplicate

### Requirement: Reaction request validation
The system SHALL respond 400 with `{"error": "<description>"}` and SHALL NOT write to the database when the body is not a JSON object, `question` or `answer` is not a non-empty string, `question` is longer than `MAX_MESSAGE_CHARS`, `answer` is longer than `MAX_ANSWER_CHARS`, or `reaction` is not `good` or `bad`.

#### Scenario: Unknown reaction
- **WHEN** `reaction` is `error`
- **THEN** the system responds 400 and nothing is stored

#### Scenario: Missing or empty text
- **WHEN** `answer` is missing or whitespace-only
- **THEN** the system responds 400 and nothing is stored

#### Scenario: Too long text
- **WHEN** `question` is longer than `MAX_MESSAGE_CHARS`
- **THEN** the system responds 400 and nothing is stored

#### Scenario: Body is not JSON
- **WHEN** the body is not valid JSON
- **THEN** the system responds 400 with `{"error": ...}`

### Requirement: Database unavailable for reactions
The system SHALL respond 503 to `POST /answer` when no database connection string is configured, and 500 when the write fails; in both cases nothing is stored and the error SHALL be logged.

#### Scenario: Database not configured
- **WHEN** the connection string is empty and a valid reaction is received
- **THEN** the system responds 503 and `POST /chat` keeps working as before

#### Scenario: Write fails
- **WHEN** the database write raises an error
- **THEN** the system responds 500 and the error is logged

### Requirement: Reactions table
The system SHALL keep records in a table `reactions` with `id` (auto-increment primary key), `question` (text, required), `answer` (text, nullable), `reaction` (nullable, only `good` or `bad`) and `dt_created` (timestamp with time zone, required, default now). A row with a non-null `reaction` SHALL mean a user reaction; a row with a null `reaction` SHALL mean a question that got no answer.

#### Scenario: Reaction value outside the set
- **WHEN** a row with `reaction` other than `good`, `bad` or null is inserted
- **THEN** the database rejects it

#### Scenario: Distinguishing unanswered rows
- **WHEN** rows with `reaction IS NULL` are selected
- **THEN** `answer IS NULL` marks a failure and a non-null `answer` marks "no data"

### Requirement: Parameterised database access
The system SHALL pass every request-derived value to the database only as a bound parameter and SHALL NOT build SQL text from request data.

#### Scenario: SQL in a question
- **WHEN** `question` contains SQL such as `'); DROP TABLE reactions; --`
- **THEN** it is stored as plain text and the table is unchanged

### Requirement: Reaction buttons in the chat
The chat page SHALL show 👍 and 👎 buttons under every bot message that is an answer to a user question, including the fixed "no information" answer, and SHALL NOT show them under the greeting or a failure text. Choosing a reaction SHALL be optional.

#### Scenario: Answer message
- **WHEN** the bot's reply to a question is shown
- **THEN** both buttons are shown under it

#### Scenario: Greeting and failure text
- **WHEN** the greeting or the "something went wrong" text is shown
- **THEN** no reaction buttons are shown

### Requirement: Reaction submission from the chat
When the visitor clicks a button, the page SHALL send `POST /answer` with the question, the bot's answer text and the chosen reaction. Only on a 201 response SHALL it highlight the chosen button and disable both buttons of that message. On any other status, a network error, or no response within about 10 seconds, the UI SHALL stay unchanged and the buttons SHALL become active again.

#### Scenario: Accepted
- **WHEN** the endpoint responds 201
- **THEN** the clicked button is highlighted and both buttons are disabled, so a message gets at most one reaction

#### Scenario: Rejected or failed
- **WHEN** the endpoint responds 503, or the request fails or times out
- **THEN** nothing is highlighted and the buttons can be clicked again

#### Scenario: Chat is not blocked
- **WHEN** a reaction request is pending
- **THEN** the visitor can still type, send new questions and use the buttons of other messages; only the two buttons of that message are disabled meanwhile

### Requirement: Schema migration on deploy
The deployment SHALL create the `reactions` table before the new version goes live, by a migration that is safe to run on every deploy. A failed migration SHALL stop the deploy so the previous version stays live.

#### Scenario: Repeated deploy
- **WHEN** the migration runs and the table already exists
- **THEN** it completes without error and without changing existing rows

#### Scenario: Migration fails
- **WHEN** the migration cannot connect or execute
- **THEN** the deploy fails and the previous version keeps serving
