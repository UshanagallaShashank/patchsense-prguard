-- Custom per-repo review rules defined in plain English by the team.
-- Injected into agent prompts so Gemini enforces team-specific policies.

create table if not exists custom_rules (
    id         uuid primary key default gen_random_uuid(),
    repo_id    uuid not null references repos(id) on delete cascade,
    rule_text  text not null,
    enabled    boolean not null default true,
    created_at timestamptz not null default now()
);

create index if not exists custom_rules_repo_id_idx on custom_rules(repo_id);

alter table custom_rules enable row level security;

-- Repo owners and members can read/write rules for their repos.
create policy "repo members can manage custom rules"
    on custom_rules for all
    using (
        exists (
            select 1 from repos r
            where r.id = custom_rules.repo_id
              and (r.owner_id = auth.uid() or exists (
                select 1 from repo_members m
                where m.repo_id = r.id and m.user_id = auth.uid()
              ))
        )
    );
