# Spec Delta

## Purpose

Filling the Pinecone index with records from the FAQ file so that a repeated run sends only new and changed records and leaves the rest untouched.

## ADDED Requirements

### Requirement: Deterministic record identity
The seeding command SHALL produce for each FAQ item one record for its `text` and one record per entry of `questions`, with id `<parent_id>-<NN>` where `NN` is the 1-based position (`01` for `text`, `02` for the first question) zero-padded to two digits. Every record SHALL carry the item's `text` as `answer`.

#### Scenario: Ids follow position
- **WHEN** an item with `parent_id` `a` has `text` and two questions
- **THEN** the records have ids `a-01`, `a-02` and `a-03`

#### Scenario: Duplicate ids are rejected
- **WHEN** two records would get the same id
- **THEN** the command fails before contacting Pinecone

### Requirement: Only new and changed records are sent
The seeding command SHALL read the existing records for the ids it built from the index and SHALL send to the index only the records that are absent or whose content differs. Unchanged records SHALL NOT be sent.

#### Scenario: Nothing changed
- **WHEN** every built record already exists in the index with identical content
- **THEN** no record is sent and the command reports all records as unchanged

#### Scenario: New question appended
- **WHEN** one question is appended to the end of an item's `questions`
- **THEN** only the record for that question is sent

#### Scenario: Answer text changed
- **WHEN** the `text` of an item changes
- **THEN** all records of that item are sent, because each carries the text as `answer`, and records of other items are not

### Requirement: Content comparison covers all record data
A record SHALL count as changed when its embedded text, `answer`, `lang`, `type` or `project` differs from the stored record. A stored record whose content cannot be determined, including one seeded before this behavior existed, SHALL count as changed.

#### Scenario: Language changed
- **WHEN** only the `lang` of an item changes
- **THEN** all records of that item are sent

#### Scenario: Stored record without comparison data
- **WHEN** an existing record carries no content fingerprint
- **THEN** it is sent as changed

### Requirement: Seeding summary
The seeding command SHALL print the number of new, changed and unchanged records before sending, and SHALL print upload progress for the records it sends.

#### Scenario: Mixed result
- **WHEN** 3 records are absent, 1 differs and 247 match
- **THEN** the command prints `3 new, 1 changed, 247 unchanged` and sends 4 records

### Requirement: Dry run
With `--dry-run` the seeding command SHALL NOT send any record. When Pinecone credentials and an index name are configured, it SHALL print the new/changed/unchanged summary based on the index; otherwise it SHALL print only the number of built records.

#### Scenario: Dry run with credentials
- **WHEN** `--dry-run` is used with credentials configured
- **THEN** the summary is printed and nothing is written

#### Scenario: Dry run without credentials
- **WHEN** `--dry-run` is used and credentials are missing
- **THEN** the number of built records is printed and the command exits successfully

### Requirement: No deletion
The seeding command SHALL NOT delete records from the index. Records whose ids are no longer produced by the FAQ file SHALL remain untouched.

#### Scenario: Question removed from file
- **WHEN** a question is removed from the FAQ file
- **THEN** its record stays in the index and is not reported as changed
