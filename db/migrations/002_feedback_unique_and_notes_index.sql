-- Migration 002: Add unique constraint to feedback to prevent duplicate submissions,
-- and improve notes table with a status-partitioned unique constraint for multiple statuses per chapter.

-- Prevent the same user from submitting the same feedback type for the same message twice.
-- This enables ON CONFLICT (message_id, user_id, type) DO NOTHING in the API.
ALTER TABLE feedback
  ADD CONSTRAINT feedback_message_user_type_unique
  UNIQUE (message_id, user_id, type);

-- Add index to speed up the admin feedback queue query (filtering unreviewed items).
-- The partial index in the initial schema (on reviewed_at where reviewed_at is null)
-- already covers this, but we explicitly add one on (type, reported_at) for filtering by type.
CREATE INDEX IF NOT EXISTS idx_feedback_type_reported ON feedback (type, reported_at DESC);

-- Add index on notes (subject, chapter_number, language) for fast fallback draft lookup.
CREATE INDEX IF NOT EXISTS idx_notes_subject_chapter_language ON notes (subject, chapter_number, language);
