-- Enable UUID generation
create extension if not exists "uuid-ossp";

-- --- Tenants / Organizations (B2B & B2C SaaS wrapper) ----------------------
-- Handles School licenses (B2B) and Individual/Family subscriptions (B2C).
create table tenants (
  id                    uuid primary key default uuid_generate_v4(),
  name                  text not null,                -- e.g. "Delhi Public School" or "Individual (B2C)"
  type                  text not null check (type in ('individual', 'school', 'coaching')),
  stripe_customer_id    text unique,                  -- Stripe/Razorpay customer mapping
  stripe_subscription_id text unique,                 -- Active billing subscription
  subscription_status   text not null default 'inactive' 
                        check (subscription_status in ('inactive', 'trialing', 'active', 'past_due', 'canceled')),
  plan_tier             text not null default 'free' 
                        check (plan_tier in ('free', 'pro', 'school_license')),
  subscription_ends_at  timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- --- Users (synced from Clerk via webhook) ---------------------------------
-- clerk_id is the canonical identifier. uuid id is used for internal FK joins.
create table users (
  id                    uuid primary key default uuid_generate_v4(),
  clerk_id              text unique not null,         -- Clerk user ID (e.g. user_2abc123)
  email                 text unique not null,
  language_preference   text not null default 'en' check (language_preference in ('en', 'hi')),
  role                  text not null default 'student' 
                        check (role in ('student', 'parent', 'teacher', 'school_admin', 'super_admin')),
  consent_state         text not null default 'pending' check (consent_state in ('pending', 'given', 'withdrawn')),
  consent_timestamp     timestamptz,
  parent_email          text,                         -- Required under DPDP Phase 3 (May 2027)
  deletion_requested_at timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- --- Tenant Memberships (RBAC mapping table) -------------------------------
-- Supports a user having multiple contexts (e.g., student in school B2B tenant, plus B2C client).
create table tenant_memberships (
  id            uuid primary key default uuid_generate_v4(),
  tenant_id     uuid not null references tenants(id) on delete cascade,
  user_id       uuid not null references users(id) on delete cascade,
  role          text not null check (role in ('student', 'parent', 'teacher', 'school_admin', 'super_admin')),
  is_primary    boolean not null default false,       -- Tracks primary active workspace default
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (tenant_id, user_id)
);

-- --- Parent-Child Links (B2C & Consent auditing) ---------------------------
-- Links parent accounts to student accounts for progress monitoring and billing.
create table parent_child_links (
  id            uuid primary key default uuid_generate_v4(),
  parent_id     uuid not null references users(id) on delete cascade,
  child_id      uuid not null references users(id) on delete cascade,
  status        text not null default 'pending' check (status in ('pending', 'approved', 'revoked')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (parent_id, child_id)
);

-- --- Conversations -----------------------------------------------------------
create table conversations (
  id          uuid primary key default uuid_generate_v4(),
  tenant_id   uuid not null references tenants(id) on delete cascade, -- Enforces data isolation
  user_id     uuid not null references users(id) on delete cascade,
  subject     text not null check (subject in ('mathematics', 'science')),
  chapter_id  text,                                   -- e.g. "math-ch03"
  created_at  timestamptz not null default now()
);

-- --- Messages (no raw text stored -- privacy) --------------------------------
create table messages (
  id                    uuid primary key default uuid_generate_v4(),
  conversation_id       uuid not null references conversations(id) on delete cascade,
  role                  text not null check (role in ('user', 'assistant')),
  content               text,                         -- REQUIRED for conversation history.
                                                      -- Despite privacy note, content must be stored
                                                      -- for the reformulation/history RAG pipeline to work.
                                                      -- Omit only when user explicitly deletes their history.
  subject               text,
  chapter_id            text,
  mode                  text check (mode in ('explain', 'solve', 'notes', 'quiz')),
  outcome               text check (outcome in ('success', 'low_confidence', 'blocked', 'error')),
  input_tokens          integer,
  output_tokens         integer,
  estimated_cost_usd    numeric(10, 6),
  retrieval_top_score   numeric(5, 4),
  retrieved_chunk_count integer,
  model                 text,
  encryption_version    text not null default 'v1',   -- Tracks which key version encrypted the content
  created_at            timestamptz not null default now()
);

-- --- Notes (pre-generated + reviewed by admin) -------------------------------
create table notes (
  id               uuid primary key default uuid_generate_v4(),
  subject          text not null check (subject in ('mathematics', 'science')),
  chapter_number   integer not null,
  chapter_title    text not null,
  language         text not null default 'en' check (language in ('en', 'hi')),
  content          text not null,                     -- markdown with LaTeX
  generated_at     timestamptz not null default now(),
  prompt_version   text not null,
  status           text not null default 'draft' check (status in ('draft', 'reviewed', 'live')),
  unique (subject, chapter_number, language, status)
);

-- --- Feedback ----------------------------------------------------------------
create table feedback (
  id           uuid primary key default uuid_generate_v4(),
  message_id   uuid references messages(id) on delete set null,
  user_id      uuid references users(id) on delete set null,
  type         text not null check (type in ('incorrect', 'inappropriate', 'helpful')),
  reported_at  timestamptz not null default now(),
  reviewed_at  timestamptz,
  resolution   text
);

-- --- Billing Transactions ---------------------------------------------------
-- Logs payments from Stripe/Razorpay for ledger audits and subscription syncing.
create table billing_transactions (
  id                      uuid primary key default uuid_generate_v4(),
  tenant_id               uuid references tenants(id) on delete set null,
  provider                text not null check (provider in ('stripe', 'razorpay')),
  external_transaction_id text not null unique,        -- Stripe charge/invoice ID or Razorpay payment ID
  amount_cents            integer not null,             -- In cents/paise (integer representation)
  currency                text not null default 'inr',
  status                  text not null check (status in ('succeeded', 'failed', 'refunded', 'pending')),
  billing_reason          text,                         -- e.g. "subscription_create" or "invoice_pay"
  created_at              timestamptz not null default now()
);

-- --- Ingestion Sources -------------------------------------------------------
create table ingestion_sources (
  id               uuid primary key default uuid_generate_v4(),
  title            text not null,
  subject          text not null check (subject in ('mathematics', 'science')),
  language         text not null default 'en',
  version          text not null,
  content_hash     text not null unique,              -- SHA-256 of source PDF
  ingested_at      timestamptz not null default now(),
  chunk_count      integer,
  status           text not null default 'pending' check (status in ('pending', 'verified', 'live'))
);

-- --- Events (analytics -- NO PII) -------------------------------------------
create table events (
  id            uuid primary key default uuid_generate_v4(),
  user_id_hash  text not null,                        -- sha256(clerk_id), never raw
  event_type    text not null,
  subject       text,
  chapter_id    text,
  mode          text,
  outcome       text,
  duration_ms   integer,
  estimated_cost_usd numeric(10, 6),
  created_at    timestamptz not null default now()
);

-- --- Deletion Jobs (DPDP Erasure Pipeline Queue) ----------------------------
create table deletion_jobs (
  id            uuid primary key default uuid_generate_v4(),
  user_id       uuid not null references users(id) on delete cascade,
  clerk_id      text not null,                                -- Stored to call Clerk API in background
  status        text not null default 'pending' check (status in ('pending', 'processing', 'completed', 'failed')),
  attempts      integer not null default 0,
  locked_at     timestamptz,
  last_error    text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (user_id)
);

-- --- Indexes -----------------------------------------------------------------
create index on tenants (stripe_customer_id);
create index on users (clerk_id);                     -- fast lookup by Clerk ID
create index on tenant_memberships (tenant_id);
create index on tenant_memberships (user_id);
create unique index tenant_memberships_one_primary_per_user
  on tenant_memberships (user_id)
  where is_primary;
create index on parent_child_links (parent_id);
create index on parent_child_links (child_id);
create index on conversations (user_id, tenant_id);
create index on messages (conversation_id, created_at desc);
create index on notes (subject, chapter_number, language, status);
create index on feedback (reviewed_at) where reviewed_at is null;
create index on billing_transactions (tenant_id, created_at);
create index on events (user_id_hash, created_at);
create index on deletion_jobs (status, locked_at) where status in ('pending', 'failed', 'processing');
