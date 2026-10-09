
CREATE TABLE IF NOT EXISTS documents (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title         TEXT NOT NULL,
  filename      TEXT NOT NULL,
  mime          TEXT NOT NULL,
  size_bytes    BIGINT NOT NULL DEFAULT 0,
  status        TEXT NOT NULL DEFAULT 'processing',
  error         TEXT,
  full_text     TEXT,
  char_count    INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS chunks (
  id            BIGSERIAL PRIMARY KEY,
  document_id   UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  chunk_index   INTEGER NOT NULL,
  text          TEXT NOT NULL,
  start_offset  INTEGER NOT NULL,
  end_offset    INTEGER NOT NULL,
  embedding     JSONB,
  UNIQUE (document_id, chunk_index)
);

CREATE INDEX IF NOT EXISTS chunks_document_id_idx ON chunks(document_id);

CREATE TABLE IF NOT EXISTS entities (
  id            BIGSERIAL PRIMARY KEY,
  document_id   UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  type          TEXT NOT NULL,
  value         TEXT NOT NULL,
  start_offset  INTEGER NOT NULL,
  end_offset    INTEGER NOT NULL,
  source        TEXT NOT NULL DEFAULT 'regex'
);

CREATE INDEX IF NOT EXISTS entities_document_id_idx ON entities(document_id);

CREATE TABLE IF NOT EXISTS templates (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  description   TEXT NOT NULL DEFAULT '',
  fields        JSONB NOT NULL DEFAULT '[]',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS extractions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id   UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  template_id   UUID NOT NULL REFERENCES templates(id) ON DELETE CASCADE,
  results       JSONB NOT NULL DEFAULT '{}',
  status        TEXT NOT NULL DEFAULT 'done',
  error         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS messages (
  id            BIGSERIAL PRIMARY KEY,
  document_id   UUID REFERENCES documents(id) ON DELETE CASCADE,
  role          TEXT NOT NULL,
  content       TEXT NOT NULL,
  sources       JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS messages_document_id_idx ON messages(document_id);

CREATE TABLE IF NOT EXISTS custom_patterns (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label         TEXT NOT NULL DEFAULT '',
  pattern       TEXT NOT NULL,
  is_regex      BOOLEAN NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE documents ADD COLUMN IF NOT EXISTS ocr_used BOOLEAN NOT NULL DEFAULT false;
