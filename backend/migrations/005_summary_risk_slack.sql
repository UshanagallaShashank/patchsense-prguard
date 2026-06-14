-- AI narrative summary of the PR written by the summary agent after review.
alter table reviews add column if not exists summary text;

-- Deterministic risk score 0-100 (critical=30, high=10, medium=3, info=1).
alter table reviews add column if not exists risk_score int;

-- Overall recommendation: "approve" | "review" | "block".
alter table reviews add column if not exists recommendation text;

-- Per-repo Slack incoming webhook URL for critical/high-risk alerts.
alter table repos add column if not exists slack_webhook_url text;

-- User feedback on individual findings to drive false-positive learning.
create table if not exists finding_feedback (
    id uuid primary key default gen_random_uuid(),
    finding_id uuid not null,
    user_id uuid not null,
    verdict text not null check (verdict in ('false_positive', 'valid')),
    created_at timestamptz default now(),
    unique (finding_id, user_id)
);
