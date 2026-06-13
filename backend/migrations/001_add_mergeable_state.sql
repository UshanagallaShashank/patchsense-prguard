-- Adds GitHub mergeable_state ("clean", "dirty", "blocked", "unstable", "unknown")
-- to reviews so the dashboard can show conflicts and gate the merge button.
-- Run in the Supabase SQL editor.
alter table reviews add column if not exists mergeable_state text;
