-- Migration 004: Private, user-owned interactive notes documents
--
-- The shared `notes` table (migration 001) is a chapter-level cache for curated /
-- generated NCERT source notes. It must NOT store per-student edits.
--
-- This migration introduces a user- and tenant-scoped document model so that
-- one student's edits never overwrite shared content, and adds a version table
-- that powers Undo and optimistic-concurrency conflict handling.

-- --- Private note documents (one per tenant/user/subject/chapter/language) ----
create table user_note_documents (
  id               uuid primary key default uuid_generate_v4(),
  tenant_id        uuid not null references tenants(id) on delete cascade,
  user_id          uuid not null references users(id) on delete cascade,
  source_note_id   uuid references notes(id) on delete set null,
  subject          text not null check (subject in ('mathematics', 'science')),
  chapter_number   integer not null,
  language         text not null default 'en' check (language in ('en', 'hi')),
  content          text not null default '',
  revision         integer not null default 1,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  -- A student has exactly one document per subject/chapter/language inside each
  -- authorized workspace (tenant).
  unique (tenant_id, user_id, subject, chapter_number, language)
);

-- --- Immutable revision history (powers Undo + audit) ------------------------
create table user_note_document_versions (
  id            uuid primary key default uuid_generate_v4(),
  document_id   uuid not null references user_note_documents(id) on delete cascade,
  revision      integer not null,
  content       text not null,
  created_at    timestamptz not null default now(),
  unique (document_id, revision)
);

-- --- Indexes -----------------------------------------------------------------
create index on user_note_documents (tenant_id, user_id);
create index on user_note_documents (user_id, subject, chapter_number, language);
create index on user_note_document_versions (document_id, revision desc);
