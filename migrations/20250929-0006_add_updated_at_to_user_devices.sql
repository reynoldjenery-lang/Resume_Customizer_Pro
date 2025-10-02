-- Drizzle migration: Add updated_at to user_devices

ALTER TABLE user_devices
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT now();

-- Backfill existing rows
UPDATE user_devices SET updated_at = created_at WHERE updated_at IS NULL;

-- Add index for updated_at
CREATE INDEX IF NOT EXISTS idx_user_devices_updated_at ON user_devices(updated_at);
