-- Run this in the Supabase SQL Editor (https://supabase.com/dashboard → SQL Editor)
ALTER TABLE reviews
  ADD COLUMN IF NOT EXISTS head_branch   TEXT,
  ADD COLUMN IF NOT EXISTS author_login  TEXT;
