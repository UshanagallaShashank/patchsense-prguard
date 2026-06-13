-- Store the PR head commit SHA on each review so the webhook can skip
-- re-running AI agents when the same commit fires multiple events.
alter table reviews add column if not exists head_sha text;
