CREATE TABLE IF NOT EXISTS reactions (
  id bigserial PRIMARY KEY,
  question text NOT NULL,
  answer text,
  reaction varchar(20) CHECK (reaction IN ('good', 'bad')),
  dt_created timestamptz NOT NULL DEFAULT now()
);
