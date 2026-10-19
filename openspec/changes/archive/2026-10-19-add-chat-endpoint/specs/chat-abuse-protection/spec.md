# Spec Delta

## Purpose

Захист публічного `POST /chat` від зловживань: обмеження кількості викликів з однієї IP-адреси за 10 хвилин, щоб запити не створювали неконтрольованих витрат на Claude.

## ADDED Requirements

### Requirement: Per-IP call limit
The system SHALL allow at most 20 calls to `POST /chat` per client IP within a 10-minute window and SHALL respond 429 to calls over the limit without calling Pinecone or Claude. The limit MAY be applied per region, so it is approximate across regions.

#### Scenario: Limit exceeded
- **WHEN** one IP makes the 21st call within 10 minutes
- **THEN** the system responds 429 and neither Pinecone nor Claude is called

#### Scenario: Window passes
- **WHEN** the 10-minute window has passed since the limited calls
- **THEN** calls from that IP are accepted again

### Requirement: Limit is checked first
The system SHALL check the call limit before validating the request body.

#### Scenario: Invalid body over limit
- **WHEN** an IP that is over the limit sends an invalid body
- **THEN** the system responds 429, not 400

### Requirement: Rate limit response text
The 429 response SHALL be `{"reply": "<fixed text>"}` in the language of `lang` taken from the body when it can be read, otherwise in English.

#### Scenario: Ukrainian user over limit
- **WHEN** the body is readable with `lang` `uk` and the limit is exceeded
- **THEN** the system responds 429 with `{"reply": "Забагато запитів. Будь ласка, спробуйте пізніше."}`

#### Scenario: Unreadable body
- **WHEN** the body cannot be parsed and the limit is exceeded
- **THEN** the system responds 429 with the English text "Too many requests. Please try again later."
