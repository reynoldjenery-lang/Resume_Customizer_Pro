-- Migration: Add updated_at to user_devices

ALTER TABLE user_devices
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT now();

-- Backfill existing rows (set updated_at to created_at for existing records where updated_at is NULL)
UPDATE user_devices SET updated_at = created_at WHERE updated_at IS NULL;

-- Optional index (not strictly necessary but keeps pattern consistent)
CREATE INDEX IF NOT EXISTS idx_user_devices_updated_at ON user_devices(updated_at);

-- Down migration (manual rollback):
-- ALTER TABLE user_devices DROP COLUMN IF EXISTS updated_at;
-- DROP INDEX IF EXISTS idx_user_devices_updated_at;
