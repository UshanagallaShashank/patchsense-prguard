-- Run this in Supabase SQL editor: https://supabase.com/dashboard/project/pkuwhcbqknveifmlwuir/sql

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_admin boolean NOT NULL DEFAULT false;
ALTER TABLE repos    ADD COLUMN IF NOT EXISTS active   boolean NOT NULL DEFAULT true;
ALTER TABLE profiles DROP COLUMN IF EXISTS bypass_plan;

-- Set your account as admin
UPDATE profiles SET is_admin = true WHERE id = 'df7422ca-d621-4c30-92a2-5f0c68f51b77';
