-- Default preferred language for new users is Hindi (`hi`).
-- Existing rows keep their stored preferred_language values.
ALTER TABLE "users" ALTER COLUMN "preferred_language" SET DEFAULT 'hi';
