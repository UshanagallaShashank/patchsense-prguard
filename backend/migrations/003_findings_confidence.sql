-- Add confidence score (0.0–1.0) to findings so low-confidence AI findings
-- can be filtered on the frontend and tracked over time for model quality.
alter table findings add column if not exists confidence float;
