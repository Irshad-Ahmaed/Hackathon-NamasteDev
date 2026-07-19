-- Migration 003: Alter feedback table unique constraint to ensure exactly one feedback per message-user pair.

-- 1. Drop existing type-inclusive unique constraint
ALTER TABLE feedback DROP CONSTRAINT IF EXISTS feedback_message_user_type_unique;

-- 2. Add message-user unique constraint
ALTER TABLE feedback ADD CONSTRAINT feedback_message_user_unique UNIQUE (message_id, user_id);
